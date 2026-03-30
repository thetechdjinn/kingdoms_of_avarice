/**
 * Game Data Export
 *
 * Exports all base game content (rooms, NPCs, items, spells, etc.) to JSON files
 * in the data/ directory. Player data is excluded.
 *
 * Can be used as:
 * - CLI script: npx tsx packages/server/src/db/data-export.ts  (or npm run data:export)
 * - Library: import { runExport } from './data-export.js' (used by API route)
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import { pool as getPool } from './index.js';
import * as roomRepo from './repositories/roomRepository.js';
import * as itemRepo from './repositories/itemRepository.js';
import * as spellRepo from './repositories/spellRepository.js';
import * as actionRepo from './repositories/actionRepository.js';
import * as effectDefRepo from './repositories/statusEffectDefinitionRepository.js';
import * as dropTableRepo from './repositories/dropTableRepository.js';
import * as progressionRepo from './repositories/progressionRepository.js';
import * as npcRepo from './repositories/npcRepository.js';
import * as factionRepo from './repositories/factionRepository.js';
import * as merchantRepo from './repositories/merchantRepository.js';
import * as npcResponseRepo from './repositories/npcResponseRepository.js';
import * as doorRepo from './repositories/doorRepository.js';
import * as npcSpellRepo from './repositories/npcSpellRepository.js';
import * as spawnConfigRepo from './repositories/spawnRepository.js';

const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');

interface ExportEnvelope {
  version: string;
  exported_at: string;
  type: string;
  data: unknown[];
}

export interface ExportResult {
  success: boolean;
  warnings: string[];
  counts: Record<string, number>;
}

function envelope(type: string, data: unknown[]): ExportEnvelope {
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    type,
    data,
  };
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: ExportEnvelope): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// Strip internal IDs and timestamps from exported objects
function stripMeta(obj: Record<string, unknown>, extraKeys: string[] = []): Record<string, unknown> {
  const stripped = { ...obj };
  delete stripped.id;
  delete stripped.createdAt;
  delete stripped.updatedAt;
  delete stripped.created_at;
  delete stripped.updated_at;
  for (const key of extraKeys) {
    delete stripped[key];
  }
  return stripped;
}

async function exportSpells(): Promise<number> {
  const spells = await spellRepo.getAllSpells();
  const data = spells.map(s => {
    const obj = stripMeta(s as unknown as Record<string, unknown>);
    return obj;
  });
  writeJson(join(DATA_DIR, 'global', 'spells.json'), envelope('spells', data));
  console.log(`  spells: ${data.length} exported`);
  return data.length;
}

async function exportStatusEffects(): Promise<number> {
  const effects = await effectDefRepo.getAllDefinitions();
  // Status effect `id` is a string identifier (e.g. "poison"), not a numeric DB ID — preserve it
  const data = effects.map(e => {
    const obj = { ...e } as Record<string, unknown>;
    delete obj.createdAt;
    delete obj.updatedAt;
    return obj;
  });
  writeJson(join(DATA_DIR, 'global', 'status_effects.json'), envelope('status_effects', data));
  console.log(`  status_effects: ${data.length} exported`);
  return data.length;
}

async function exportActions(): Promise<number> {
  const actions = await actionRepo.getAllActions();
  const data = actions.map(a => stripMeta(a as unknown as Record<string, unknown>));
  writeJson(join(DATA_DIR, 'global', 'actions.json'), envelope('actions', data));
  console.log(`  actions: ${data.length} exported`);
  return data.length;
}

async function exportItems(): Promise<number> {
  const items = await itemRepo.getAllTemplates();
  const data = items.map(item => stripMeta(item as unknown as Record<string, unknown>));
  writeJson(join(DATA_DIR, 'global', 'items.json'), envelope('items', data));
  console.log(`  items: ${data.length} exported`);
  return data.length;
}

async function exportFactions(): Promise<number> {
  const factions = await factionRepo.getAllFactions();
  const data = factions.map(f => stripMeta(f as unknown as Record<string, unknown>));
  writeJson(join(DATA_DIR, 'global', 'factions.json'), envelope('factions', data));
  console.log(`  factions: ${data.length} exported`);
  return data.length;
}

async function exportDropTables(itemIdToName: Map<number, string>): Promise<number> {
  const tables = await dropTableRepo.getAllDropTables();
  const data: unknown[] = [];

  for (const table of tables) {
    const entries = await dropTableRepo.getEntriesForDropTable(table.id);
    const exportedEntries = entries.map(entry => {
      const obj: Record<string, unknown> = {
        dropChance: entry.dropChance,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        currencyMin: entry.currencyMin,
        currencyMax: entry.currencyMax,
        allowedDenominations: entry.allowedDenominations,
      };
      if (entry.itemTemplateId) {
        obj.itemName = itemIdToName.get(entry.itemTemplateId) ?? null;
        if (!obj.itemName) {
          console.warn(`    WARNING: Drop table "${table.name}" entry references unknown item ID ${entry.itemTemplateId}`);
        }
      } else {
        obj.itemName = null;
      }
      return obj;
    });

    data.push({
      name: table.name,
      description: table.description,
      entries: exportedEntries,
    });
  }

  writeJson(join(DATA_DIR, 'global', 'drop_tables.json'), envelope('drop_tables', data));
  console.log(`  drop_tables: ${data.length} exported`);
  return data.length;
}

async function exportProgression(): Promise<Record<string, number>> {
  const progDir = join(DATA_DIR, 'global', 'progression');
  ensureDir(progDir);

  const classes = await progressionRepo.getAllClasses();
  writeJson(join(progDir, 'classes.json'), envelope('classes', classes.map(c => stripMeta(c as unknown as Record<string, unknown>))));
  console.log(`  progression/classes: ${classes.length} exported`);

  const races = await progressionRepo.getAllRaces();
  writeJson(join(progDir, 'races.json'), envelope('races', races.map(r => stripMeta(r as unknown as Record<string, unknown>))));
  console.log(`  progression/races: ${races.length} exported`);

  const levels = await progressionRepo.getProgressionTable();
  writeJson(join(progDir, 'progression_table.json'), envelope('progression_table', levels as unknown as unknown[]));
  console.log(`  progression/progression_table: ${levels.length} exported`);

  return { classes: classes.length, races: races.length, levels: levels.length };
}

async function exportRooms(
  idToTagMap: Map<number, string>,
  warnings: string[]
): Promise<Map<string, number[]>> {
  const rooms = await roomRepo.getAllRooms();
  const allExits = await roomRepo.getAllExits();
  const allDoors = await doorRepo.getAllDoors();

  // Group exits by from_room_id
  const exitsByRoom = new Map<number, Array<{ direction: string; toRoomId: number }>>();
  for (const exit of allExits) {
    if (!exitsByRoom.has(exit.from_room_id)) {
      exitsByRoom.set(exit.from_room_id, []);
    }
    exitsByRoom.get(exit.from_room_id)!.push({
      direction: exit.direction,
      toRoomId: exit.to_room_id,
    });
  }

  // Group doors by entry_room_id (export from entry side only to avoid duplicates)
  const doorsByRoom = new Map<number, typeof allDoors>();
  for (const door of allDoors) {
    if (!doorsByRoom.has(door.entryRoomId)) {
      doorsByRoom.set(door.entryRoomId, []);
    }
    doorsByRoom.get(door.entryRoomId)!.push(door);
  }

  // Load spawn configs and NPC templates for room spawn export
  const allSpawns = await spawnConfigRepo.getAllSpawns();
  const spawnsByRoom = new Map<number, typeof allSpawns>();
  for (const spawn of allSpawns) {
    if (!spawnsByRoom.has(spawn.roomId)) {
      spawnsByRoom.set(spawn.roomId, []);
    }
    spawnsByRoom.get(spawn.roomId)!.push(spawn);
  }
  const npcTemplates = await npcRepo.getAllTemplates();
  const npcIdToName = new Map<number, string>();
  for (const tmpl of npcTemplates) {
    npcIdToName.set(tmpl.id, tmpl.name);
  }

  // Group rooms by area
  const areaRooms = new Map<string, unknown[]>();
  const areaRoomIds = new Map<string, number[]>();

  for (const room of rooms) {
    const area = (room.area || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_');

    if (!room.tag) {
      const msg = `Room ${room.id} "${room.name}" has no tag`;
      warnings.push(msg);
      console.warn(`    WARNING: ${msg}`);
    }

    const exits = (exitsByRoom.get(room.id) || []).map(e => ({
      direction: e.direction,
      toTag: idToTagMap.get(e.toRoomId) ?? null,
    }));

    // Check for unresolvable exit tags
    for (const exit of exits) {
      if (!exit.toTag) {
        const msg = `Room "${room.name}" (${room.tag}) exit ${exit.direction} points to untagged room`;
        warnings.push(msg);
      }
    }

    const roomDoors = (doorsByRoom.get(room.id) || []).map(door => {
      const exitTag = door.exitRoomId ? (idToTagMap.get(door.exitRoomId) ?? null) : null;
      return {
        name: door.name,
        displayName: door.displayName,
        doorType: door.doorType,
        description: door.description,
        entryDirection: door.entryDirection,
        exitTag,
        exitDirection: door.exitDirection,
        defaultState: door.defaultState,
        autoResetSeconds: door.autoResetSeconds,
        hasLock: door.hasLock,
        keyItemTag: door.keyItemTag,
        pickDifficultyMin: door.pickDifficultyMin,
        pickDifficultyMax: door.pickDifficultyMax,
        bashDifficulty: door.bashDifficulty,
        isHidden: door.isHidden,
        triggerText: door.triggerText,
        passageMessageSelf: door.passageMessageSelf,
        passageMessageRoom: door.passageMessageRoom,
        passageMessageArrival: door.passageMessageArrival,
        itemDisplayName: door.itemDisplayName,
        isTemporary: door.isTemporary,
        spawnTriggerText: door.spawnTriggerText,
        durationSeconds: door.durationSeconds,
        appearMessage: door.appearMessage,
        disappearMessage: door.disappearMessage,
        requiredLevel: door.requiredLevel,
        maxLevel: door.maxLevel,
        requiredClasses: door.requiredClasses,
        requiredQuestFlag: door.requiredQuestFlag,
        requiredItemTag: door.requiredItemTag,
        denialMessage: door.denialMessage,
      };
    });

    const roomData: Record<string, unknown> = {
      tag: room.tag,
      name: room.name,
      description: room.description,
      area: room.area,
      terrain: room.terrain,
      darkness_level: room.darkness_level ?? 0,
      features: room.features,
      exits,
    };
    if (roomDoors.length > 0) {
      roomData.doors = roomDoors;
    }

    const roomSpawns = (spawnsByRoom.get(room.id) || []).map(spawn => {
      const npcName = npcIdToName.get(spawn.npcId) ?? null;
      if (!npcName) {
        const msg = `Room "${room.tag || room.id}" spawn references unknown NPC ID ${spawn.npcId}`;
        warnings.push(msg);
        console.warn(`    WARNING: ${msg}`);
      }
      return { npcName, maxActive: spawn.maxActive, respawnSeconds: spawn.respawnSeconds };
    });
    if (roomSpawns.length > 0) {
      roomData.spawns = roomSpawns;
    }

    if (!areaRooms.has(area)) {
      areaRooms.set(area, []);
      areaRoomIds.set(area, []);
    }
    areaRooms.get(area)!.push(roomData);
    areaRoomIds.get(area)!.push(room.id);
  }

  // Write each area's rooms
  for (const [area, roomsData] of areaRooms) {
    const areaDir = join(DATA_DIR, 'areas', area);
    ensureDir(areaDir);
    writeJson(join(areaDir, 'rooms.json'), envelope('rooms', roomsData));
    console.log(`  areas/${area}/rooms: ${roomsData.length} exported`);
  }

  return new Map([...areaRoomIds.entries()].map(([area, ids]) => [area, ids]));
}

async function exportNpcs(
  idToTagMap: Map<number, string>,
  itemIdToName: Map<number, string>,
  spellIdToMnemonic: Map<number, string>,
  dropTableIdToName: Map<number, string>,
  factionIdToName: Map<number, string>,
  warnings: string[]
): Promise<Set<string>> {
  const templates = await npcRepo.getAllTemplates();
  const allNpcResponses = await npcResponseRepo.getAllResponses();
  const allMerchantInventory = new Map<number, Awaited<ReturnType<typeof merchantRepo.getInventoryForTemplate>>>();

  // Load merchant inventory for merchant NPCs
  for (const tmpl of templates) {
    if (tmpl.merchantEnabled) {
      const inv = await merchantRepo.getInventoryForTemplate(tmpl.id);
      allMerchantInventory.set(tmpl.id, inv);
    }
  }

  // Group NPC responses by NPC template ID
  const responsesByNpc = new Map<number, typeof allNpcResponses>();
  for (const resp of allNpcResponses) {
    if (!responsesByNpc.has(resp.npcTemplateId)) {
      responsesByNpc.set(resp.npcTemplateId, []);
    }
    responsesByNpc.get(resp.npcTemplateId)!.push(resp);
  }

  // Group NPCs by area (based on spawn room area)
  const npcsByArea = new Map<string, unknown[]>();

  // Build room ID → area lookup
  const rooms = await roomRepo.getAllRooms();
  const roomIdToArea = new Map<number, string>();
  for (const room of rooms) {
    const area = (room.area || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    roomIdToArea.set(room.id, area);
  }

  // Build NPC → area lookup from spawn configs
  const npcSpawns = await spawnConfigRepo.getAllSpawns();
  const npcIdToAreas = new Map<number, Set<string>>();
  for (const spawn of npcSpawns) {
    const spawnArea = roomIdToArea.get(spawn.roomId) ?? 'global';
    if (!npcIdToAreas.has(spawn.npcId)) {
      npcIdToAreas.set(spawn.npcId, new Set());
    }
    npcIdToAreas.get(spawn.npcId)!.add(spawnArea);
  }

  for (const tmpl of templates) {
    // Determine area from spawn configs; use 'global' if no spawns or multiple areas
    const tmplAreas = npcIdToAreas.get(tmpl.id);
    const area = (tmplAreas && tmplAreas.size === 1) ? [...tmplAreas][0] : 'global';

    // Build NPC export object
    const npcData: Record<string, unknown> = {
      name: tmpl.name,
      description: tmpl.description,
      health: tmpl.health,
      maxHealth: tmpl.maxHealth,
      hostile: tmpl.hostile,
      level: tmpl.level,
      experienceReward: tmpl.experienceReward,
      maxMana: tmpl.maxMana,
      baseAccuracy: tmpl.baseAccuracy,
      baseDefense: tmpl.baseDefense,
      baseCritChance: tmpl.baseCritChance,
      baseDodge: tmpl.baseDodge,
      damageReduction: tmpl.damageReduction,
      traits: tmpl.traits,
      fleeEnabled: tmpl.fleeEnabled,
      fleeHpPercent: tmpl.fleeHpPercent,
      callForHelpChance: tmpl.callForHelpChance,
      interactable: tmpl.interactable,
      allowedAreas: tmpl.allowedAreas,
      roamEnabled: tmpl.roamEnabled,
      roamInterval: tmpl.roamInterval,
      roamChance: tmpl.roamChance,
      essenceReward: tmpl.essenceReward,
      essenceClass: tmpl.essenceClass,
      leaveCorpse: tmpl.leaveCorpse,
      corpseDuration: tmpl.corpseDuration,
      augmentations: tmpl.augmentations,
      enterRoomMessage: tmpl.enterRoomMessage,
      exitRoomMessage: tmpl.exitRoomMessage,
      spawnMessage: tmpl.spawnMessage,
      deathMessage: tmpl.deathMessage,
      merchantEnabled: tmpl.merchantEnabled,
      properName: tmpl.properName,
      spellPower: tmpl.spellPower,
      enabled: tmpl.enabled,
    };

    // FK references → portable strings
    if (tmpl.dropTableId) {
      npcData.dropTableName = dropTableIdToName.get(tmpl.dropTableId) ?? null;
      if (!npcData.dropTableName) {
        const msg = `NPC "${tmpl.name}" references unknown drop table ID ${tmpl.dropTableId}`;
        warnings.push(msg);
        console.warn(`    WARNING: ${msg}`);
      }
    }
    if (tmpl.primaryFactionId) {
      npcData.primaryFactionName = factionIdToName.get(tmpl.primaryFactionId) ?? null;
      if (!npcData.primaryFactionName) {
        const msg = `NPC "${tmpl.name}" references unknown faction ID ${tmpl.primaryFactionId}`;
        warnings.push(msg);
        console.warn(`    WARNING: ${msg}`);
      }
    }

    // Inline attacks
    npcData.attacks = (tmpl.attacks || []).map(atk => ({
      attackType: atk.attackType,
      name: atk.name,
      minDamage: atk.minDamage,
      maxDamage: atk.maxDamage,
      attacksPerRound: atk.attacksPerRound,
      percentage: atk.percentage,
      hitMessage: atk.hitMessage,
      missMessage: atk.missMessage,
      hitVerb: atk.hitVerb,
      hitVerb3p: atk.hitVerb3p,
      missVerb: atk.missVerb,
      missVerb3p: atk.missVerb3p,
    }));

    // Inline spells
    if (tmpl.spells && tmpl.spells.length > 0) {
      npcData.spells = tmpl.spells.map(ns => {
        const spellMnemonic = spellIdToMnemonic.get(ns.spellId) ?? null;
        if (!spellMnemonic) {
          const msg = `NPC "${tmpl.name}" spell references unknown spell ID ${ns.spellId}`;
          warnings.push(msg);
          console.warn(`    WARNING: ${msg}`);
        }
        return {
          spellMnemonic,
          priority: ns.priority,
          castChance: ns.castChance,
          conditionType: ns.conditionType,
          conditionValue: ns.conditionValue,
          cooldownRounds: ns.cooldownRounds,
        };
      });
    }

    // Inline merchant inventory (merchant-only)
    if (tmpl.merchantEnabled) {
      const inv = allMerchantInventory.get(tmpl.id) || [];
      if (inv.length > 0) {
        npcData.merchantInventory = inv.map(entry => {
          const itemName = itemIdToName.get(entry.itemTemplateId) ?? null;
          if (!itemName) {
            const msg = `NPC "${tmpl.name}" merchant inventory references unknown item ID ${entry.itemTemplateId}`;
            warnings.push(msg);
            console.warn(`    WARNING: ${msg}`);
          }
          return {
            itemName,
            maxStock: entry.maxStock,
            restockChance: entry.restockChance,
          };
        });
      }
    }

    // Inline NPC responses (exports all responses regardless of interactable/merchant flags)
    const responses = responsesByNpc.get(tmpl.id) || [];
    if (responses.length > 0) {
      npcData.npcResponses = responses.map(r => ({
        triggerKeywords: r.triggerKeywords,
        response: r.response,
      }));
    }

    if (!npcsByArea.has(area)) {
      npcsByArea.set(area, []);
    }
    npcsByArea.get(area)!.push(npcData);
  }

  // Write each area's NPCs
  const areasWithNpcs = new Set<string>();
  for (const [area, npcs] of npcsByArea) {
    const areaDir = join(DATA_DIR, 'areas', area);
    ensureDir(areaDir);
    writeJson(join(areaDir, 'npcs.json'), envelope('npcs', npcs));
    areasWithNpcs.add(area);
    console.log(`  areas/${area}/npcs: ${npcs.length} exported`);
  }
  return areasWithNpcs;
}

/**
 * Run the full game data export. Writes JSON files to data/.
 * Can be called from CLI or from an API route.
 */
export async function runExport(): Promise<ExportResult> {
  const warnings: string[] = [];
  const counts: Record<string, number> = {};

  // Build FK lookup maps
  console.log('Building lookup maps...');
  const idToTagMap = await roomRepo.getIdToTagMap();
  const items = await itemRepo.getAllTemplates();
  const itemIdToName = new Map<number, string>();
  for (const item of items) {
    itemIdToName.set(item.id, item.name);
  }

  const spells = await spellRepo.getAllSpells();
  const spellIdToMnemonic = new Map<number, string>();
  for (const spell of spells) {
    spellIdToMnemonic.set(spell.id, spell.mnemonic);
  }

  const dropTables = await dropTableRepo.getAllDropTables();
  const dropTableIdToName = new Map<number, string>();
  for (const dt of dropTables) {
    dropTableIdToName.set(dt.id, dt.name);
  }

  const factions = await factionRepo.getAllFactions();
  const factionIdToName = new Map<number, string>();
  for (const f of factions) {
    factionIdToName.set(f.id, f.name);
  }

  // Ensure output directories
  ensureDir(join(DATA_DIR, 'global'));

  console.log('\nExporting global data...');
  counts.spells = await exportSpells();
  counts.status_effects = await exportStatusEffects();
  counts.actions = await exportActions();
  const progCounts = await exportProgression();
  Object.assign(counts, progCounts);
  counts.items = await exportItems();
  counts.factions = await exportFactions();
  counts.drop_tables = await exportDropTables(itemIdToName);

  console.log('\nExporting area data...');
  const areaRoomIds = await exportRooms(idToTagMap, warnings);
  const areasWithNpcs = await exportNpcs(idToTagMap, itemIdToName, spellIdToMnemonic, dropTableIdToName, factionIdToName, warnings);

  // Count rooms and NPCs
  let totalRooms = 0;
  for (const ids of areaRoomIds.values()) totalRooms += ids.length;
  counts.rooms = totalRooms;

  const templates = await npcRepo.getAllTemplates();
  counts.npcs = templates.length;

  // Build manifest
  const importOrder: string[] = [
    'global/spells.json',
    'global/status_effects.json',
    'global/actions.json',
    'global/progression/classes.json',
    'global/progression/races.json',
    'global/progression/progression_table.json',
    'global/items.json',
    'global/factions.json',
    'global/drop_tables.json',
  ];

  // Add area files in sorted order (union of room areas and NPC-only areas)
  const allAreas = new Set([...areaRoomIds.keys(), ...areasWithNpcs]);
  const areas = [...allAreas].sort();
  for (const area of areas) {
    if (areaRoomIds.has(area)) {
      importOrder.push(`areas/${area}/rooms.json`);
    }
    if (areasWithNpcs.has(area)) {
      importOrder.push(`areas/${area}/npcs.json`);
    }
  }

  const manifest = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    import_order: importOrder,
    warnings,
  };

  writeFileSync(join(DATA_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('\nWrote _manifest.json');

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s) recorded in manifest.`);
  }

  console.log('\n=== Export Complete ===');

  return { success: true, warnings, counts };
}

// --- CLI entry point ---
// Only run CLI export when executed directly (not when imported by the API route)
const isCli = process.argv[1] && (
  process.argv[1].endsWith('data-export.ts') ||
  process.argv[1].endsWith('data-export.js')
);

if (isCli) {
  (async () => {
    console.log('=== Game Data Export ===\n');
    try {
      const result = await runExport();
      if (result.warnings.length > 0) {
        console.log(`\n${result.warnings.length} warning(s) recorded in manifest.`);
      }
    } finally {
      const pool = getPool();
      await pool.end();
    }
  })().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
  });
}
