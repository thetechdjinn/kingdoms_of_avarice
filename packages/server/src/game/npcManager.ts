/**
 * NPC Instance Manager
 *
 * Central module managing all live NPC instances in memory.
 * Handles spawning, despawning, room indexing, target finding,
 * respawn queue, and periodic DB persistence.
 */

import { NpcTemplate, NpcAttack, ResourceType, DeathState, PlayerRegenState, StealthMode } from '@koa/shared';
import type { CombatEntity, CombatState } from './combatEntity.js';
import { NPC_ID_OFFSET, isPlayerEntity, getEntityRoomId } from './combatEntity.js';
import * as npcRepo from '../db/repositories/npcRepository.js';
import { colors } from '../utils/colors.js';
import { withNpcNameCapitalized } from '../utils/textFormat.js';
import { sendCombatMessage, broadcastCombatToRoom } from './combatMessaging.js';
import { MessageType } from '@koa/shared';
import type { AuthenticatedSocket } from './socket.js';
import type { GameWorld } from './world.js';
import * as doorStateManager from '../services/doorStateManager.js';
import * as merchantRepo from '../db/repositories/merchantRepository.js';
import { processNpcEffectsTick, getEffectDefinition } from './statusEffects.js';
import * as merchantResponseRepo from '../db/repositories/merchantResponseRepository.js';
import type { MerchantResponse } from '@koa/shared';

// Lazy world reference for NPC movement (flee, return, roam)
let worldRef: GameWorld | null = null;
// Reference to connected players for aggro-on-arrival checks
let connectedPlayersRef: Map<number, AuthenticatedSocket> | null = null;

/**
 * Initialize the NPC manager's world reference and connected players.
 * Must be called after initializeNpcManager() during server startup.
 */
export function initializeNpcWorld(world: GameWorld, players: Map<number, AuthenticatedSocket>): void {
  worldRef = world;
  connectedPlayersRef = players;
}

/**
 * Get the world reference (for use by npcBehavior.ts).
 */
export function getWorldRef(): GameWorld | null {
  return worldRef;
}

/**
 * NPC combat instance — extends CombatEntity with NPC-specific fields.
 */
export interface NpcCombatInstance extends CombatEntity {
  templateId: number;
  template: NpcTemplate;
  currentRoomId: number;
  currentMana: number;
  behaviorState: 'idle' | 'combat' | 'fleeing' | 'returning';
  augmentation: string | null;
  dbInstanceId: number;  // Original DB instance ID (before offset)
  // Phase 3: Behavior state machine runtime fields
  fleeDistance: number;           // Rooms traveled since fleeing started
  combatRoomId: number | null;   // Room where combat was when flee triggered
  hasCalledForHelp: boolean;     // Prevents repeated calls per engagement
  nextRoamAt: number;            // Date.now() timestamp for next roam check
  // Phase B: Spell AI runtime fields
  spellCooldowns: Map<number, number>;  // spellId → rounds remaining
  combatRoundCount: number;             // rounds in current combat engagement
  // Corpse state
  isCorpse: boolean;              // true if this NPC is a corpse awaiting cleanup
  corpseRemoveAt: number;         // Date.now() timestamp for corpse removal
}

interface RespawnEntry {
  templateId: number;
  spawnRoomId: number;
  respawnAt: number;  // Date.now() timestamp
}

// In-memory stores
const npcTemplates = new Map<number, NpcTemplate>();
const npcInstances = new Map<number, NpcCombatInstance>();  // keyed by entityId
const npcsByRoom = new Map<number, Set<number>>();  // roomId -> Set of entityIds
const respawnQueue: RespawnEntry[] = [];

let respawnInterval: NodeJS.Timeout | null = null;
let persistInterval: NodeJS.Timeout | null = null;
let roamInterval: NodeJS.Timeout | null = null;
let restockInterval: NodeJS.Timeout | null = null;
let regenInterval: NodeJS.Timeout | null = null;

const OPPOSITE_DIRECTIONS: Record<string, string> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'below',
  down: 'above',
  northeast: 'southwest',
  northwest: 'southeast',
  southeast: 'northwest',
  southwest: 'northeast',
};

const RESPAWN_CHECK_MS = 5000;  // Check respawn queue every 5 seconds
const PERSIST_INTERVAL_MS = 60000;  // Save instances to DB every 60 seconds
const ROAM_CHECK_MS = 5000;  // Check roaming NPCs every 5 seconds
const RESTOCK_INTERVAL_MS = 3600000;  // Restock merchant inventories every hour
const REGEN_TICK_MS = 5000;  // NPC regen tick every 5 seconds (matches player regen)

// NPC regen rates (same as player base rates)
const NPC_HEALTH_REGEN_PERCENT = Number(process.env.HEALTH_REGEN_BASE_PERCENT) || 1;
const NPC_MANA_REGEN_PERCENT = Number(process.env.MANA_REGEN_BASE_PERCENT) || 2;

// Debug mode — when enabled, aggro messages like "X attacks you!" are shown
let npcDebugMode = false;

export function isNpcDebugEnabled(): boolean {
  return npcDebugMode;
}

export function setNpcDebug(enabled: boolean): void {
  npcDebugMode = enabled;
}

/**
 * Build the broadcast message for an NPC spawning into a room.
 * Uses the dedicated spawnMessage template with {name} substitution.
 * Falls back to "<name> appears." if no spawn message is set.
 */
function buildSpawnMessage(npc: NpcCombatInstance): string {
  if (!npc.template.spawnMessage) {
    return `${withNpcNameCapitalized(npc.entityName, npc.isProperName)} appears.`;
  }
  return npc.template.spawnMessage.replaceAll('{name}', npc.entityName);
}

/**
 * Create a fresh CombatState for an NPC.
 */
function createFreshCombatState(): CombatState {
  return {
    targets: new Set<number>(),
    energy: 0,
    carriedEnergy: 0,
    combatAction: 'melee',
    activeSpell: null,
    combatOrderPosition: 0,
  };
}

/**
 * Create a fresh DeathState (alive).
 */
function createAliveDeathState(): DeathState {
  return {
    isDropped: false,
    isAided: false,
    isDead: false,
  };
}

/**
 * Create a fresh RegenState for an NPC.
 */
function createNpcRegenState(): PlayerRegenState {
  return {
    enhancedRegen: new Set<string>(),
    inCombat: false,
    isPoisoned: false,
  };
}

/**
 * Reset an NPC's behavior state to idle.
 * Clears all fleeing/returning/combat tracking fields.
 */
export function resetNpcBehaviorState(npc: NpcCombatInstance): void {
  npc.behaviorState = 'idle';
  npc.fleeDistance = 0;
  npc.combatRoomId = null;
  npc.hasCalledForHelp = false;
  npc.regenState.inCombat = false;
  npc.combatRoundCount = 0;
}

/**
 * Check if any NPC is currently targeting a given player.
 * Used to determine whether a player should remain in combat after an NPC drops them.
 */
export function isPlayerTargetedByAnyNpc(playerId: number): boolean {
  for (const npc of npcInstances.values()) {
    if (npc.combatState.targets.has(playerId)) return true;
  }
  return false;
}

/**
 * Build an NpcCombatInstance from a template and DB instance data.
 */
function createNpcCombatEntity(
  template: NpcTemplate,
  dbInstanceId: number,
  currentRoomId: number,
  currentHealth: number,
  currentMana: number,
  augmentation: string | null
): NpcCombatInstance {
  const entityId = dbInstanceId + NPC_ID_OFFSET;

  // Build display name with optional augmentation prefix
  let displayName = template.name;
  if (augmentation) {
    displayName = `${augmentation} ${template.name}`;
  }

  return {
    // CombatEntity fields
    entityId,
    entityName: displayName,
    isProperName: template.properName,
    entityType: 'npc',
    vitals: {
      hp: currentHealth,
      maxHp: template.maxHealth,
      resource: currentMana,
      maxResource: template.maxMana,
      resourceType: ResourceType.MANA,
    },
    combatState: createFreshCombatState(),
    characterLevel: template.level,
    characterStats: {
      strength: 10,
      intelligence: 10,
      dexterity: 10,
      constitution: 10,
      wisdom: 10,
      charisma: 10,
    },
    combatLevel: 3,  // NPCs use pre-computed stats, not combat level
    activeEffects: new Map(),
    deathState: createAliveDeathState(),
    regenState: createNpcRegenState(),
    stealthMode: 'none' as StealthMode,
    canSeeHidden: template.traits.includes('see-invisible'),

    // NPC-specific fields
    templateId: template.id,
    template,
    currentRoomId,
    currentMana,
    behaviorState: 'idle',
    augmentation,
    dbInstanceId,
    fleeDistance: 0,
    combatRoomId: null,
    hasCalledForHelp: false,
    nextRoamAt: Date.now() + (template.roamInterval * 1000),
    spellCooldowns: new Map(),
    combatRoundCount: 0,
    isCorpse: false,
    corpseRemoveAt: 0,
  };
}

/**
 * Add an NPC instance to the room index.
 */
function addToRoomIndex(entityId: number, roomId: number): void {
  if (!npcsByRoom.has(roomId)) {
    npcsByRoom.set(roomId, new Set());
  }
  npcsByRoom.get(roomId)!.add(entityId);
}

/**
 * Remove an NPC instance from the room index.
 */
function removeFromRoomIndex(entityId: number, roomId: number): void {
  const roomNpcs = npcsByRoom.get(roomId);
  if (roomNpcs) {
    roomNpcs.delete(entityId);
    if (roomNpcs.size === 0) {
      npcsByRoom.delete(roomId);
    }
  }
}

/**
 * Initialize the NPC manager — load templates, instances, start timers.
 */
export async function initializeNpcManager(): Promise<void> {
  // Load all templates from DB
  const templates = await npcRepo.getAllTemplates();
  for (const template of templates) {
    npcTemplates.set(template.id, template);
  }

  // Load existing instances from DB
  const instances = await npcRepo.getAllInstances();
  for (const inst of instances) {
    const template = npcTemplates.get(inst.npc_id);
    if (!template) {
      console.warn(`[NPC Manager] Instance ${inst.id} references unknown template ${inst.npc_id}, skipping`);
      continue;
    }

    // Dead instances (corpses from before restart) should be cleaned up, not loaded.
    // Corpse state is in-memory only, so these would load as broken 0-HP NPCs.
    if (inst.current_health <= 0) {
      npcRepo.deleteInstance(inst.id).catch(error => {
        console.error(`[NPC Manager] Failed to delete dead instance ${inst.id}:`, error);
      });
      if (template.respawnTime && template.respawnTime > 0 && template.spawnRoomId) {
        queueRespawn(template.id, template.spawnRoomId, template.respawnTime);
      }
      continue;
    }

    const npc = createNpcCombatEntity(
      template,
      inst.id,
      inst.current_room_id,
      inst.current_health,
      inst.current_mana,
      inst.augmentation
    );

    npcInstances.set(npc.entityId, npc);
    addToRoomIndex(npc.entityId, npc.currentRoomId);
  }

  // Spawn instances for any templates that have a spawn room but no live instance.
  // Skip templates that already have a pending respawn (dead corpses cleaned up above).
  const templatesWithInstances = new Set(
    instances
      .filter(i => i.current_health > 0)
      .map(i => i.npc_id)
  );
  const templatesWithPendingRespawn = new Set(respawnQueue.map(e => e.templateId));
  for (const template of templates) {
    if (template.spawnRoomId && !templatesWithInstances.has(template.id) && !templatesWithPendingRespawn.has(template.id)) {
      await spawnNpcFromTemplate(template, template.spawnRoomId);
    }
  }

  // Start respawn timer
  respawnInterval = setInterval(processRespawnQueue, RESPAWN_CHECK_MS);

  // Start roaming timer
  roamInterval = setInterval(processRoaming, ROAM_CHECK_MS);

  // Start periodic persistence
  persistInterval = setInterval(saveAllInstances, PERSIST_INTERVAL_MS);

  // Start NPC regen timer
  regenInterval = setInterval(processNpcRegen, REGEN_TICK_MS);

  // Start merchant restock timer
  restockInterval = setInterval(async () => {
    try {
      const count = await merchantRepo.processRestock();
      if (count > 0) {
        console.log(`[NPC Manager] Restocked ${count} non-common merchant items`);
      }
    } catch (error) {
      console.error('[NPC Manager] Restock failed:', error);
    }
  }, RESTOCK_INTERVAL_MS);

  console.log(`[NPC Manager] Initialized with ${npcTemplates.size} templates, ${npcInstances.size} instances`);
}

/**
 * Spawn a new NPC instance from a template.
 */
async function spawnNpcFromTemplate(
  template: NpcTemplate,
  roomId: number,
  augmentation: string | null = null
): Promise<NpcCombatInstance> {
  // Pick augmentation if none provided and template has augmentations defined
  if (!augmentation && template.augmentations.length > 0) {
    const roll = Math.floor(Math.random() * (template.augmentations.length + 1));
    augmentation = roll < template.augmentations.length ? template.augmentations[roll] : null;
  }

  // Create DB instance
  const dbId = await npcRepo.createInstance(
    template.id,
    roomId,
    template.maxHealth,
    template.maxMana,
    augmentation
  );

  // Create in-memory instance
  const npc = createNpcCombatEntity(
    template,
    dbId,
    roomId,
    template.maxHealth,
    template.maxMana,
    augmentation
  );

  npcInstances.set(npc.entityId, npc);
  addToRoomIndex(npc.entityId, roomId);

  return npc;
}

/**
 * Process the respawn queue — spawn NPCs whose timer has expired.
 * Also cleans up expired corpses.
 */
async function processRespawnQueue(): Promise<void> {
  processCorpseCleanup();

  const now = Date.now();
  const toSpawn: RespawnEntry[] = [];

  // Collect entries that are ready to spawn
  for (let i = respawnQueue.length - 1; i >= 0; i--) {
    if (respawnQueue[i].respawnAt <= now) {
      toSpawn.push(respawnQueue.splice(i, 1)[0]);
    }
  }

  // Spawn each
  for (const entry of toSpawn) {
    const template = npcTemplates.get(entry.templateId);
    if (!template) continue;

    try {
      const npc = await spawnNpcFromTemplate(template, entry.spawnRoomId);
      broadcastCombatToRoom(entry.spawnRoomId, colors.cyan(buildSpawnMessage(npc)), []);

      // Check for hostile aggro on players in the spawn room
      if (npc.template.hostile) {
        checkNpcAggroOnArrival(npc);
      }
    } catch (error) {
      console.error(`[NPC Manager] Failed to respawn template ${entry.templateId}:`, error);
      // Re-queue with a delay
      respawnQueue.push({
        ...entry,
        respawnAt: now + 30000,
      });
    }
  }
}

/**
 * Get an NPC instance by entity ID.
 */
export function getNpcInstance(entityId: number): NpcCombatInstance | undefined {
  return npcInstances.get(entityId);
}

/**
 * Get all NPC instances in a room.
 */
export function getNpcsInRoom(roomId: number): NpcCombatInstance[] {
  const entityIds = npcsByRoom.get(roomId);
  if (!entityIds) return [];

  const npcs: NpcCombatInstance[] = [];
  for (const entityId of entityIds) {
    const npc = npcInstances.get(entityId);
    if (npc) {
      npcs.push(npc);
    }
  }
  return npcs;
}

/**
 * Find an NPC in a room by name.
 * Matches: exact, prefix, base name without augmentation.
 */
export function findNpcInRoom(targetName: string, roomId: number): NpcCombatInstance | undefined {
  const npcs = getNpcsInRoom(roomId);
  if (npcs.length === 0) return undefined;

  const lowerTarget = targetName.toLowerCase();

  // Exact match on display name
  for (const npc of npcs) {
    if (npc.entityName.toLowerCase() === lowerTarget) {
      return npc;
    }
  }

  // Prefix match on display name
  for (const npc of npcs) {
    if (npc.entityName.toLowerCase().startsWith(lowerTarget)) {
      return npc;
    }
  }

  // Match on base template name (without augmentation)
  for (const npc of npcs) {
    if (npc.template.name.toLowerCase() === lowerTarget ||
        npc.template.name.toLowerCase().startsWith(lowerTarget)) {
      return npc;
    }
  }

  return undefined;
}

/**
 * Iterator over all live NPC instances.
 */
export function getAllNpcInstances(): NpcCombatInstance[] {
  return Array.from(npcInstances.values());
}

/**
 * Remove an NPC instance from memory + room index.
 * Called on NPC death.
 */
export function removeNpcInstance(entityId: number): void {
  const npc = npcInstances.get(entityId);
  if (!npc) return;

  removeFromRoomIndex(entityId, npc.currentRoomId);
  npcInstances.delete(entityId);

  // Delete from DB
  npcRepo.deleteInstance(npc.dbInstanceId).catch(error => {
    console.error(`[NPC Manager] Failed to delete instance ${npc.dbInstanceId}:`, error);
  });
}

/**
 * Mark an NPC instance as a corpse. It stays in the room for display
 * but does not act, aggro, or roam. Scheduled for removal after corpseDuration.
 */
export function markAsCorpse(npc: NpcCombatInstance): void {
  npc.isCorpse = true;
  npc.behaviorState = 'idle';
  npc.combatState.targets.clear();
  npc.regenState.inCombat = false;
  npc.activeEffects.clear();
  npc.corpseRemoveAt = Date.now() + (npc.template.corpseDuration * 1000);
}

/**
 * Process corpse cleanup — remove corpses whose duration has expired.
 * Called on the same timer as the respawn queue.
 */
function processCorpseCleanup(): void {
  const now = Date.now();

  // Collect expired corpses first, then remove (avoid mutating Map during iteration)
  const expiredCorpses: NpcCombatInstance[] = [];
  for (const npc of npcInstances.values()) {
    if (npc.isCorpse && now >= npc.corpseRemoveAt) {
      expiredCorpses.push(npc);
    }
  }

  for (const npc of expiredCorpses) {
    const template = npc.template;
    removeFromRoomIndex(npc.entityId, npc.currentRoomId);
    npcInstances.delete(npc.entityId);

    // Delete from DB
    npcRepo.deleteInstance(npc.dbInstanceId).catch(error => {
      console.error(`[NPC Manager] Failed to delete corpse instance ${npc.dbInstanceId} (${template.name}):`, error);
    });

    // Queue respawn now that corpse is gone
    if (template.respawnTime && template.respawnTime > 0 && template.spawnRoomId) {
      queueRespawn(template.id, template.spawnRoomId, template.respawnTime);
    }
  }
}

/**
 * Queue a respawn for a template.
 */
export function queueRespawn(templateId: number, spawnRoomId: number, respawnTimeSeconds: number): void {
  // Dedup: don't queue beyond maxActive (live instances + pending respawns)
  const template = npcTemplates.get(templateId);
  const maxActive = template?.maxActive ?? 1;
  const liveCount = Array.from(npcInstances.values()).filter(n => n.templateId === templateId && !n.isCorpse).length;
  const pendingCount = respawnQueue.filter(e => e.templateId === templateId).length;
  if (liveCount + pendingCount >= maxActive) return;

  respawnQueue.push({
    templateId,
    spawnRoomId,
    respawnAt: Date.now() + (respawnTimeSeconds * 1000),
  });
}

/**
 * Save all live instances to DB for persistence.
 */
export async function saveAllInstances(): Promise<void> {
  const instances = Array.from(npcInstances.values())
    .map(npc => ({
      id: npc.dbInstanceId,
      npcId: npc.templateId,
      currentRoomId: npc.currentRoomId,
      currentHealth: npc.isCorpse ? 0 : npc.vitals.hp, // Save corpses with 0 HP so startup detects them as dead
      currentMana: npc.isCorpse ? 0 : npc.currentMana,
      augmentation: npc.augmentation,
    }));

  if (instances.length === 0) return;

  try {
    await npcRepo.saveInstances(instances);
  } catch (error) {
    console.error('[NPC Manager] Failed to persist instances:', error);
  }
}

/**
 * Initiate mutual aggro between an NPC and a player.
 * Shared helper used by both checkNpcAggroOnArrival and checkHostileAggro.
 */
function initiateAggro(npc: NpcCombatInstance, player: CombatEntity, roomId: number): void {
  npc.combatState.targets.add(player.entityId);
  npc.regenState.inCombat = true;
  npc.behaviorState = 'combat';

  // Mark the player as in combat (stops regen) but do NOT add the NPC to
  // the player's targets — players must manually choose to attack back.
  player.regenState.inCombat = true;

  // Clear resting state
  player.regenState.enhancedRegen.clear();

  // Send messages (only in debug mode — normal play skips the explicit aggro announcement)
  if (npcDebugMode) {
    sendCombatMessage(player, MessageType.OUTPUT,
      colors.boldRed(`${withNpcNameCapitalized(npc.entityName, npc.isProperName)} attacks you!`)
    );

    broadcastCombatToRoom(
      roomId,
      colors.boldRed(`${withNpcNameCapitalized(npc.entityName, npc.isProperName)} attacks ${player.entityName}!`),
      [player.entityId]
    );
  }
}

/**
 * Check all players in an NPC's room for aggro (reverse of checkHostileAggro).
 * Called internally after an NPC roams into a room or respawns.
 */
function checkNpcAggroOnArrival(npc: NpcCombatInstance): void {
  if (!connectedPlayersRef) return;
  if (!npc.template.hostile) return;
  if (npc.vitals.hp <= 0) return;
  if (npc.combatState.targets.size > 0) return;
  if (npc.behaviorState === 'fleeing' || npc.behaviorState === 'returning') return;

  for (const player of connectedPlayersRef.values()) {
    const playerRoomId = getEntityRoomId(player);
    if (playerRoomId !== npc.currentRoomId) continue;

    // Skip players in training form
    if (player.isTraining) continue;

    // Skip dead/dropped players
    if (player.deathState?.isDead || player.deathState?.isDropped) continue;

    // Skip hidden players unless NPC can see hidden
    if (player.stealthMode === 'hidden' && !npc.canSeeHidden) continue;

    initiateAggro(npc, player, npc.currentRoomId);
  }
}

/**
 * Process roaming for all idle NPCs with roaming enabled.
 * Called on a timer every ROAM_CHECK_MS.
 */
function processRoaming(): void {
  if (!connectedPlayersRef || !worldRef) return;

  const now = Date.now();

  for (const npc of npcInstances.values()) {
    // Skip non-roaming, non-idle, or dead NPCs
    if (!npc.template.roamEnabled) continue;
    if (npc.behaviorState !== 'idle') continue;
    if (npc.vitals.hp <= 0) continue;

    // Skip if not yet time
    if (now < npc.nextRoamAt) continue;

    // Reset timer (always, regardless of roll outcome)
    npc.nextRoamAt = now + (npc.template.roamInterval * 1000);

    // Roll for roam (roamChance is % chance to move: roll <= roamChance means move)
    const roll = Math.floor(Math.random() * 100) + 1;  // 1-100 inclusive
    if (roll > npc.template.roamChance) continue;

    // Pick a random valid exit
    const exits = getValidNpcExits(npc);
    if (exits.length === 0) continue;

    const chosen = exits[Math.floor(Math.random() * exits.length)];
    moveNpc(npc, chosen.direction, chosen.roomId);

    // Check for aggro in new room
    if (npc.template.hostile) {
      checkNpcAggroOnArrival(npc);
    }
  }
}

/**
 * Process regeneration and status effect ticks for all living NPCs.
 * Called on a timer every REGEN_TICK_MS.
 */
function processNpcRegen(): void {
  const dotDeaths: NpcCombatInstance[] = [];

  for (const npc of npcInstances.values()) {
    // Skip dead/corpse NPCs
    if (npc.vitals.hp <= 0 || npc.isCorpse) continue;

    // Process status effect ticks (DoT damage, HoT healing, expiration)
    const effectResult = processNpcEffectsTick(npc);
    if (effectResult.died) {
      dotDeaths.push(npc);
      continue;
    }

    // Natural regen: skip if in combat or has regen-blocking effects
    if (npc.regenState.inCombat) continue;
    if (npc.regenState.isPoisoned) continue;

    // Also check for any active effect that blocks regen (e.g., poison)
    if (npc.activeEffects && npc.activeEffects.size > 0) {
      let blocksRegen = false;
      for (const [, effect] of npc.activeEffects) {
        const effectDef = getEffectDefinition(effect.definitionId);
        if (effectDef?.blocksRegen) {
          blocksRegen = true;
          break;
        }
      }
      if (blocksRegen) continue;
    }

    // Health regen
    if (npc.vitals.hp < npc.vitals.maxHp) {
      const hpRegen = Math.max(1, Math.ceil(npc.vitals.maxHp * NPC_HEALTH_REGEN_PERCENT / 100));
      npc.vitals.hp = Math.min(npc.vitals.hp + hpRegen, npc.vitals.maxHp);
    }

    // Mana regen — use vitals.resource as source of truth (spells deduct from it)
    const currentMana = npc.vitals.resource ?? 0;
    if (npc.template.maxMana > 0 && currentMana < npc.template.maxMana) {
      const manaRegen = Math.max(1, Math.ceil(npc.template.maxMana * NPC_MANA_REGEN_PERCENT / 100));
      const newMana = Math.min(currentMana + manaRegen, npc.template.maxMana);
      npc.vitals.resource = newMana;
      npc.currentMana = newMana;
    }
  }

  // Process DoT deaths outside the iteration loop
  for (const npc of dotDeaths) {
    handleNpcDotDeath(npc).catch(error => {
      console.error(`[NPC Manager] Failed to process DoT death for ${npc.entityName}:`, error);
    });
  }
}

/**
 * Handle NPC death from DoT damage (outside combat loop).
 * Delegates to processNpcDeath with the connected players who were fighting it.
 */
async function handleNpcDotDeath(npc: NpcCombatInstance): Promise<void> {
  if (!connectedPlayersRef) return;

  const { processNpcDeath } = await import('./npcDeathHandler.js');
  const { broadcastToRoom } = await import('./socket.js');

  const roomId = npc.currentRoomId;

  // Broadcast death message
  broadcastToRoom(
    roomId,
    colors.boldRed(`${npc.entityName} collapses and dies!`)
  );

  // Process death (XP, loot, despawn, respawn)
  await processNpcDeath(npc, null, roomId, connectedPlayersRef);

  // Clear combat state for all players who were fighting this NPC
  for (const [, socket] of connectedPlayersRef) {
    if (socket.combatState.targets.has(npc.entityId)) {
      socket.combatState.targets.delete(npc.entityId);
      if (socket.combatState.targets.size === 0) {
        socket.regenState.inCombat = false;
      }
    }
  }
}

/**
 * Check for hostile NPCs in a room and initiate aggro on a player.
 */
export function checkHostileAggro(
  roomId: number,
  player: CombatEntity,
): void {
  // Skip players in training form
  if (isPlayerEntity(player) && (player as AuthenticatedSocket).isTraining) return;

  const npcs = getNpcsInRoom(roomId);
  if (npcs.length === 0) return;

  for (const npc of npcs) {
    // Skip already-in-combat, dead, fleeing, or returning NPCs
    if (npc.combatState.targets.size > 0) continue;
    if (npc.vitals.hp <= 0) continue;
    if (npc.behaviorState === 'fleeing' || npc.behaviorState === 'returning') continue;

    // Determine if this NPC should aggro: either naturally hostile,
    // or a merchant that was previously attacked by this player
    const isHostile = npc.template.hostile;
    const isAngryMerchant = npc.template.merchantEnabled
      && isPlayerEntity(player)
      && isMerchantHostileToPlayer((player as AuthenticatedSocket).characterId!, npc.templateId);

    if (!isHostile && !isAngryMerchant) continue;

    // Skip if player is hidden and NPC can't see hidden
    if (player.stealthMode === 'hidden' && !npc.canSeeHidden) continue;

    // Reset hostility timer when merchant re-aggros
    if (isAngryMerchant) {
      setMerchantHostile((player as AuthenticatedSocket).characterId!, npc.templateId);
    }

    initiateAggro(npc, player, roomId);
  }
}

/**
 * Reload NPC templates from DB.
 * Used by @reload mobs command.
 */
export async function reloadNpcTemplates(): Promise<number> {
  npcTemplates.clear();
  const templates = await npcRepo.getAllTemplates();
  for (const template of templates) {
    npcTemplates.set(template.id, template);
  }

  // Update template references on live instances
  for (const npc of npcInstances.values()) {
    const updatedTemplate = npcTemplates.get(npc.templateId);
    if (updatedTemplate) {
      npc.template = updatedTemplate;
    }
  }

  // Spawn instances for any new templates that have a spawn room but no live instance
  const templatesWithInstances = new Set(
    Array.from(npcInstances.values()).map(npc => npc.templateId)
  );
  let spawned = 0;
  for (const template of templates) {
    if (template.spawnRoomId && !templatesWithInstances.has(template.id)) {
      try {
        await spawnNpcFromTemplate(template, template.spawnRoomId);
        spawned++;
      } catch (error) {
        console.error(`[NPC Manager] Failed to spawn template ${template.id} (${template.name}) during reload:`, error);
      }
    }
  }
  if (spawned > 0) {
    console.log(`[NPC Manager] Spawned ${spawned} new NPC(s) from reload`);
  }

  return templates.length;
}

/**
 * Get a template by ID.
 */
export function getTemplate(templateId: number): NpcTemplate | undefined {
  return npcTemplates.get(templateId);
}

// ============================================================================
// NPC MOVEMENT INFRASTRUCTURE
// ============================================================================

/**
 * Check if an NPC can pass through a door in a given direction from a room.
 * NPCs cannot open doors — only open passageways and no-door exits are passable.
 */
export function canNpcPassDirection(fromRoomId: number, direction: string): boolean {
  const door = doorStateManager.getDoorByRoomAndDirection(fromRoomId, direction);
  if (!door) {
    // No door in this direction — NPC can freely pass
    return true;
  }
  const result = doorStateManager.canPassThrough(door.id, fromRoomId);
  return result.allowed;
}

/**
 * Check if a room is within an NPC's allowed areas.
 * If allowedAreas is empty, all rooms are allowed.
 */
export function isRoomInAllowedArea(npc: NpcCombatInstance, roomId: number): boolean {
  if (npc.template.allowedAreas.length === 0) return true;
  if (!worldRef) return true; // Can't check without world reference

  const room = worldRef.getRoom(roomId);
  if (!room) return false;

  return npc.template.allowedAreas.includes(room.area);
}

/**
 * Get valid exits for an NPC from its current room.
 * Filters by door passability and allowed areas.
 */
export function getValidNpcExits(npc: NpcCombatInstance): { direction: string; roomId: number }[] {
  if (!worldRef) return [];

  const room = worldRef.getRoom(npc.currentRoomId);
  if (!room) return [];

  const validExits: { direction: string; roomId: number }[] = [];
  for (const [direction, targetRoomId] of room.exits) {
    // Check door passability
    if (!canNpcPassDirection(npc.currentRoomId, direction)) continue;
    // Check allowed areas
    if (!isRoomInAllowedArea(npc, targetRoomId)) continue;
    validExits.push({ direction, roomId: targetRoomId });
  }

  return validExits;
}

/**
 * Move an NPC from its current room to a new room.
 * Updates currentRoomId, room indexes, and broadcasts exit/enter messages.
 * Returns true on success.
 */
export function moveNpc(npc: NpcCombatInstance, direction: string, newRoomId: number): boolean {
  const oldRoomId = npc.currentRoomId;
  if (oldRoomId === newRoomId) return false;

  // Update room indexes
  removeFromRoomIndex(npc.entityId, oldRoomId);
  npc.currentRoomId = newRoomId;
  addToRoomIndex(npc.entityId, newRoomId);

  // Broadcast exit message to old room
  const exitMsg = npc.template.exitRoomMessage
    ? npc.template.exitRoomMessage.replaceAll('{name}', npc.entityName).replaceAll('{direction}', direction)
    : `${withNpcNameCapitalized(npc.entityName, npc.isProperName)} leaves ${direction}.`;
  broadcastCombatToRoom(oldRoomId, colors.cyan(exitMsg), []);

  // Broadcast enter message to new room ({direction} = where they came from)
  const fromDirection = OPPOSITE_DIRECTIONS[direction] || direction;
  const enterMsg = npc.template.enterRoomMessage
    ? npc.template.enterRoomMessage.replaceAll('{name}', npc.entityName).replaceAll('{direction}', fromDirection)
    : `${withNpcNameCapitalized(npc.entityName, npc.isProperName)} arrives.`;
  broadcastCombatToRoom(newRoomId, colors.cyan(enterMsg), []);

  return true;
}

/**
 * Spawn an NPC instance from a template (public API for REST routes).
 */
export async function spawnNpcPublic(template: NpcTemplate, roomId: number): Promise<NpcCombatInstance> {
  const npc = await spawnNpcFromTemplate(template, roomId);
  broadcastCombatToRoom(roomId, colors.cyan(buildSpawnMessage(npc)), []);
  if (npc.template.hostile) {
    checkNpcAggroOnArrival(npc);
  }
  return npc;
}

/**
 * Despawn all active instances of a given template.
 */
export function despawnByTemplate(templateId: number): number {
  const toRemove: number[] = [];
  for (const [entityId, npc] of npcInstances) {
    if (npc.templateId === templateId) {
      toRemove.push(entityId);
    }
  }
  for (const entityId of toRemove) {
    removeNpcInstance(entityId);
  }
  return toRemove.length;
}

// ============================================================================
// MERCHANT HELPERS
// ============================================================================

/**
 * Get all merchant NPCs currently in a room.
 */
export function getMerchantsInRoom(roomId: number): NpcCombatInstance[] {
  return getNpcsInRoom(roomId).filter(npc => npc.template.merchantEnabled);
}

/**
 * Find a specific merchant NPC in a room by name.
 * Returns undefined if the NPC is not a merchant.
 */
export function findMerchantInRoom(targetName: string, roomId: number): NpcCombatInstance | undefined {
  if (!targetName || targetName.trim() === '') {
    return undefined;
  }
  const npc = findNpcInRoom(targetName, roomId);
  if (npc && npc.template.merchantEnabled) {
    return npc;
  }
  // If no direct match, try matching only merchants
  const merchants = getMerchantsInRoom(roomId);
  if (merchants.length === 0) return undefined;

  const lowerTarget = targetName.toLowerCase();
  for (const m of merchants) {
    if (m.entityName.toLowerCase() === lowerTarget ||
        m.entityName.toLowerCase().startsWith(lowerTarget) ||
        m.template.name.toLowerCase() === lowerTarget ||
        m.template.name.toLowerCase().startsWith(lowerTarget)) {
      return m;
    }
  }
  return undefined;
}

/**
 * Get a template by entity ID (resolves NPC_ID_OFFSET).
 */
export function getTemplateByEntityId(entityId: number): NpcTemplate | undefined {
  const npc = npcInstances.get(entityId);
  return npc?.template;
}

// ============================================================================
// Merchant Response Cache
// ============================================================================

/** Cache: npcTemplateId → MerchantResponse[] */
const merchantResponseCache = new Map<number, MerchantResponse[]>();

/**
 * Load merchant responses for a template (cached).
 */
async function loadMerchantResponses(npcTemplateId: number): Promise<MerchantResponse[]> {
  const cached = merchantResponseCache.get(npcTemplateId);
  if (cached) return cached;
  const responses = await merchantResponseRepo.getResponsesForTemplate(npcTemplateId);
  merchantResponseCache.set(npcTemplateId, responses);
  return responses;
}

/**
 * Get a response matching keywords in a message for a merchant.
 * Returns the response text or undefined if no match.
 */
export async function getResponseForKeywords(npcTemplateId: number, message: string): Promise<string | undefined> {
  const responses = await loadMerchantResponses(npcTemplateId);
  const match = merchantResponseRepo.findMatchingResponse(responses, message);
  return match?.response;
}

/**
 * Clear the merchant response cache (for @reload merchantresponses).
 */
export function clearMerchantResponseCache(): void {
  merchantResponseCache.clear();
}

// ============================================================================
// Merchant Hostility Tracking
// ============================================================================

/** Per-player-per-templateId hostile expiry timestamps */
const merchantHostility = new Map<number, Map<number, number>>();

/** Default hostility duration: 10 minutes */
const MERCHANT_HOSTILITY_DURATION_MS = 10 * 60 * 1000;

/**
 * Mark a merchant as hostile to a specific player for a duration.
 */
export function setMerchantHostile(
  characterId: number,
  npcTemplateId: number,
  durationMs: number = MERCHANT_HOSTILITY_DURATION_MS
): void {
  let playerMap = merchantHostility.get(characterId);
  if (!playerMap) {
    playerMap = new Map();
    merchantHostility.set(characterId, playerMap);
  }
  playerMap.set(npcTemplateId, Date.now() + durationMs);
}

/**
 * Check if a merchant is hostile to a specific player.
 */
export function isMerchantHostileToPlayer(characterId: number, npcTemplateId: number): boolean {
  const playerMap = merchantHostility.get(characterId);
  if (!playerMap) return false;
  const expiresAt = playerMap.get(npcTemplateId);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    playerMap.delete(npcTemplateId);
    if (playerMap.size === 0) merchantHostility.delete(characterId);
    return false;
  }
  return true;
}

/**
 * Clear all merchant hostility for a player (on disconnect).
 */
export function clearMerchantHostility(characterId: number): void {
  merchantHostility.delete(characterId);
}

/**
 * Shutdown: save instances and clear timers.
 */
export async function shutdownNpcManager(): Promise<void> {
  if (respawnInterval) {
    clearInterval(respawnInterval);
    respawnInterval = null;
  }
  if (roamInterval) {
    clearInterval(roamInterval);
    roamInterval = null;
  }
  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }
  if (restockInterval) {
    clearInterval(restockInterval);
    restockInterval = null;
  }
  if (regenInterval) {
    clearInterval(regenInterval);
    regenInterval = null;
  }
  await saveAllInstances();
  console.log('[NPC Manager] Shut down, instances persisted');
}
