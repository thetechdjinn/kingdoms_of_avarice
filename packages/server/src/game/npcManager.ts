/**
 * NPC Instance Manager
 *
 * Central module managing all live NPC instances in memory.
 * Handles spawning, despawning, room indexing, target finding,
 * respawn queue, and periodic DB persistence.
 */

import { NpcTemplate, NpcAttack, ResourceType, DeathState, PlayerRegenState, StealthMode } from '@koa/shared';
import type { CombatEntity, CombatState } from './combatEntity.js';
import { NPC_ID_OFFSET, isPlayerEntity } from './combatEntity.js';
import * as npcRepo from '../db/repositories/npcRepository.js';
import { colors } from '../utils/colors.js';
import { sendCombatMessage, broadcastCombatToRoom } from './combatMessaging.js';
import { MessageType } from '@koa/shared';
import type { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';

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

const RESPAWN_CHECK_MS = 5000;  // Check respawn queue every 5 seconds
const PERSIST_INTERVAL_MS = 60000;  // Save instances to DB every 60 seconds

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

  // If no instances exist but templates have spawn rooms, spawn one of each
  if (instances.length === 0) {
    for (const template of templates) {
      if (template.spawnRoomId) {
        await spawnNpcFromTemplate(template, template.spawnRoomId);
      }
    }
  }

  // Start respawn timer
  respawnInterval = setInterval(processRespawnQueue, RESPAWN_CHECK_MS);

  // Start periodic persistence
  persistInterval = setInterval(saveAllInstances, PERSIST_INTERVAL_MS);

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
  // Pick augmentation if enabled and none provided
  if (!augmentation && template.augmentationEnabled && template.augmentations.length > 0) {
    augmentation = template.augmentations[Math.floor(Math.random() * template.augmentations.length)];
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
 */
async function processRespawnQueue(): Promise<void> {
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
      // Broadcast spawn message to room
      broadcastCombatToRoom(
        entry.spawnRoomId,
        colors.cyan(`${npc.entityName} appears.`),
        []
      );
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
 * Queue a respawn for a template.
 */
export function queueRespawn(templateId: number, spawnRoomId: number, respawnTimeSeconds: number): void {
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
  const instances = Array.from(npcInstances.values()).map(npc => ({
    id: npc.dbInstanceId,
    npcId: npc.templateId,
    currentRoomId: npc.currentRoomId,
    currentHealth: npc.vitals.hp,
    currentMana: npc.currentMana,
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
 * Check for hostile NPCs in a room and initiate aggro on a player.
 */
export function checkHostileAggro(
  roomId: number,
  player: CombatEntity,
  connectedPlayers: Map<number, AuthenticatedSocket>
): void {
  const npcs = getNpcsInRoom(roomId);
  if (npcs.length === 0) return;

  for (const npc of npcs) {
    // Skip non-hostile, already-in-combat, or dead NPCs
    if (!npc.template.hostile) continue;
    if (npc.combatState.targets.size > 0) continue;
    if (npc.vitals.hp <= 0) continue;

    // Skip if player is hidden and NPC can't see hidden
    if (player.stealthMode === 'hidden' && !npc.canSeeHidden) continue;

    // Initiate aggro
    npc.combatState.targets.add(player.entityId);
    npc.regenState.inCombat = true;
    npc.behaviorState = 'combat';

    player.combatState.targets.add(npc.entityId);
    player.regenState.inCombat = true;

    // Clear resting state
    player.regenState.enhancedRegen.clear();

    // Send messages
    sendCombatMessage(player, MessageType.OUTPUT,
      colors.boldRed(`${npc.entityName} attacks you!`)
    );

    broadcastCombatToRoom(
      roomId,
      colors.boldRed(`${npc.entityName} attacks ${player.entityName}!`),
      [player.entityId]
    );
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

  return templates.length;
}

/**
 * Get a template by ID.
 */
export function getTemplate(templateId: number): NpcTemplate | undefined {
  return npcTemplates.get(templateId);
}

/**
 * Shutdown: save instances and clear timers.
 */
export async function shutdownNpcManager(): Promise<void> {
  if (respawnInterval) {
    clearInterval(respawnInterval);
    respawnInterval = null;
  }
  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }
  await saveAllInstances();
  console.log('[NPC Manager] Shut down, instances persisted');
}
