/**
 * Game Data Import Script
 *
 * Reads _manifest.json from data/ and imports each file in dependency order
 * using merge/upsert semantics. Existing records are updated, new ones created.
 *
 * Run: npx tsx packages/server/src/db/data-import.ts
 * Or:  npm run data:import
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import { pool as getPool, query, withTransaction } from './index.js';
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
import * as merchantResponseRepo from './repositories/merchantResponseRepository.js';
import * as doorRepo from './repositories/doorRepository.js';
import * as npcSpellRepo from './repositories/npcSpellRepository.js';

const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');

interface ImportResult {
  file: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const results: ImportResult[] = [];

function readJsonFile(relativePath: string): { type: string; data: unknown[] } | null {
  const fullPath = join(DATA_DIR, relativePath);
  if (!existsSync(fullPath)) {
    console.warn(`  WARNING: File not found: ${relativePath}`);
    return null;
  }
  try {
    const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
    return { type: content.type, data: content.data };
  } catch (err) {
    console.error(`  ERROR: Failed to parse ${relativePath}: ${(err as Error).message}`);
    return null;
  }
}

// ============================================================================
// Importers
// ============================================================================

async function importSpells(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'spells.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const mnemonic = item.mnemonic as string;
      if (!mnemonic) { result.skipped++; continue; }

      const existing = await spellRepo.getSpellByMnemonic(mnemonic);
      const input = {
        name: item.name as string,
        mnemonic,
        description: item.description as string | undefined,
        spellType: item.spellType as string,
        targetType: item.targetType as string,
        manaCost: item.manaCost as number,
        damageDice: item.damageDice as string | undefined,
        healingDice: item.healingDice as string | undefined,
        statusEffect: item.statusEffect as string | undefined,
        effectDuration: item.effectDuration as number | undefined,
        levelRequired: item.levelRequired as number,
        classRestrictions: item.classRestrictions as string[] | undefined,
        isAttackSpell: item.isAttackSpell as boolean,
        damageScalingStat: item.damageScalingStat as string | undefined,
        damageScalingFactor: item.damageScalingFactor as number | undefined,
        healingScalingStat: item.healingScalingStat as string | undefined,
        healingScalingFactor: item.healingScalingFactor as number | undefined,
        telegraphMessage: item.telegraphMessage as string | undefined,
        saveStat: item.saveStat as string | undefined,
        saveDifficulty: item.saveDifficulty as number | undefined,
      };

      if (existing) {
        await spellRepo.updateSpell(existing.id, input as unknown as Parameters<typeof spellRepo.updateSpell>[1]);
        result.updated++;
      } else {
        await spellRepo.createSpell(input as unknown as Parameters<typeof spellRepo.createSpell>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Spell "${item.mnemonic}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importStatusEffects(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'status_effects.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const id = item.id as string;
      if (!id) { result.skipped++; continue; }

      const existing = await effectDefRepo.getDefinitionById(id);
      const input = {
        id,
        name: item.name as string,
        description: item.description as string | undefined,
        category: item.category as string,
        stackingBehavior: item.stackingBehavior as string,
        maxStacks: item.maxStacks as number | undefined,
        accuracyModifier: item.accuracyModifier as number | undefined,
        defenseModifier: item.defenseModifier as number | undefined,
        energyModifier: item.energyModifier as number | undefined,
        damageModifier: item.damageModifier as number | undefined,
        speedModifier: item.speedModifier as number | undefined,
        tickDamageMin: item.tickDamageMin as number | undefined,
        tickDamageMax: item.tickDamageMax as number | undefined,
        tickHealingMin: item.tickHealingMin as number | undefined,
        tickHealingMax: item.tickHealingMax as number | undefined,
        tickMessage: item.tickMessage as string | undefined,
        silentTick: item.silentTick as boolean | undefined,
        wearOffMessage: item.wearOffMessage as string | undefined,
        blocksRegen: item.blocksRegen as boolean | undefined,
        blocksMovement: item.blocksMovement as boolean | undefined,
        isBlind: item.isBlind as boolean | undefined,
      };

      if (existing) {
        await effectDefRepo.updateDefinition(id, input as unknown as Parameters<typeof effectDefRepo.updateDefinition>[1]);
        result.updated++;
      } else {
        await effectDefRepo.createDefinition(input as unknown as Parameters<typeof effectDefRepo.createDefinition>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Effect "${item.id}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importActions(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'actions.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const command = item.command as string;
      if (!command) { result.skipped++; continue; }

      const existing = await actionRepo.getActionByCommand(command);
      if (existing) {
        await actionRepo.updateAction(existing.id, item as unknown as Parameters<typeof actionRepo.updateAction>[1]);
        result.updated++;
      } else {
        await actionRepo.createAction(item as unknown as Parameters<typeof actionRepo.createAction>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Action "${item.command}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importClasses(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'classes.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const classId = (item.class_id ?? item.classId) as string;
      if (!classId) { result.skipped++; continue; }

      const existing = await progressionRepo.getClassById(classId);
      if (existing) {
        await progressionRepo.updateClass(classId, item as unknown as Parameters<typeof progressionRepo.updateClass>[1]);
        result.updated++;
      } else {
        await progressionRepo.createClass(item as unknown as Parameters<typeof progressionRepo.createClass>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Class "${item.class_id ?? item.classId}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importRaces(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'races.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const raceId = (item.race_id ?? item.raceId) as string;
      if (!raceId) { result.skipped++; continue; }

      const existing = await progressionRepo.getRaceById(raceId);
      if (existing) {
        await progressionRepo.updateRace(raceId, item as unknown as Parameters<typeof progressionRepo.updateRace>[1]);
        result.updated++;
      } else {
        await progressionRepo.createRace(item as unknown as Parameters<typeof progressionRepo.createRace>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Race "${item.race_id ?? item.raceId}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importProgressionTable(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'progression_table.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const level = item.level as number;
      if (level === undefined || level === null) { result.skipped++; continue; }

      const existing = await progressionRepo.getLevelRequirement(level);
      // setLevelRequirement is upsert
      await progressionRepo.setLevelRequirement(item as unknown as Parameters<typeof progressionRepo.setLevelRequirement>[0]);
      if (existing) {
        result.updated++;
      } else {
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Level ${item.level}: ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importItems(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'items.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const name = item.name as string;
      if (!name) { result.skipped++; continue; }

      const existing = await itemRepo.getTemplateByName(name);

      // Read fields using snake_case (export format) with camelCase fallback
      const input = {
        name,
        short_desc: ((item.short_desc ?? item.shortDesc) as string) || '',
        long_desc: (item.long_desc ?? item.longDesc) as string | undefined,
        room_desc: (item.room_desc ?? item.roomDesc) as string | undefined,
        keywords: (item.keywords as string[]) || [],
        weight: item.weight as number | undefined,
        size: item.size as number | undefined,
        base_value: (item.base_value ?? item.baseValue) as number | undefined,
        item_type: (item.item_type ?? item.itemType) as string,
        equipment_slot: (item.equipment_slot ?? item.equipmentSlot) as string | undefined,
        flags: item.flags as Record<string, unknown> | undefined,
        max_stack: (item.max_stack ?? item.maxStack) as number | undefined,
        container_capacity: (item.container_capacity ?? item.containerCapacity) as number | undefined,
        container_weight_limit: (item.container_weight_limit ?? item.containerWeightLimit) as number | undefined,
        weapon_data: (item.weapon_data ?? item.weaponData) as Record<string, unknown> | undefined,
        armor_data: (item.armor_data ?? item.armorData) as Record<string, unknown> | undefined,
        consumable_data: (item.consumable_data ?? item.consumableData) as Record<string, unknown> | undefined,
        light_data: (item.light_data ?? item.lightData) as Record<string, unknown> | undefined,
        tool_data: (item.tool_data ?? item.toolData) as Record<string, unknown> | undefined,
        requirements: item.requirements as Record<string, unknown> | undefined,
        stat_modifiers: (item.stat_modifiers ?? item.statModifiers) as Record<string, unknown> | undefined,
        stealth_modifier: (item.stealth_modifier ?? item.stealthModifier) as number | undefined,
        effect_slots: (item.effect_slots ?? item.effectSlots) as number | undefined,
        base_effects: (item.base_effects ?? item.baseEffects) as unknown | undefined,
        rarity: item.rarity as string | undefined,
        max_in_world: (item.max_in_world ?? item.maxInWorld) as number | undefined,
      };

      if (existing) {
        await itemRepo.updateTemplate(existing.id, input as unknown as Parameters<typeof itemRepo.updateTemplate>[1]);
        result.updated++;
      } else {
        await itemRepo.createTemplate(input as unknown as Parameters<typeof itemRepo.createTemplate>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Item "${item.name}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importFactions(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'factions.json', created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const name = item.name as string;
      if (!name) { result.skipped++; continue; }

      const existing = await factionRepo.getFactionByName(name);
      const factionType = (item.factionType ?? item.faction_type) as string;
      if (existing) {
        await factionRepo.updateFaction(existing.id, {
          name,
          description: item.description as string | undefined,
          factionType,
        } as unknown as Parameters<typeof factionRepo.updateFaction>[1]);
        result.updated++;
      } else {
        await factionRepo.createFaction({
          name,
          description: item.description as string | undefined,
          factionType,
        } as unknown as Parameters<typeof factionRepo.createFaction>[0]);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Faction "${item.name}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

async function importDropTables(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'drop_tables.json', created: 0, updated: 0, skipped: 0, errors: [] };

  // Build item name→id lookup
  const allItems = await itemRepo.getAllTemplates();
  const itemNameToId = new Map<string, number>();
  for (const item of allItems) {
    itemNameToId.set(item.name.toLowerCase(), item.id);
  }

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const name = item.name as string;
      if (!name) { result.skipped++; continue; }

      let existing = await dropTableRepo.getDropTableByName(name);
      let tableId: number;

      if (existing) {
        await dropTableRepo.updateDropTable(existing.id, {
          name,
          description: item.description as string | undefined,
        });
        tableId = existing.id;
        result.updated++;
      } else {
        const created = await dropTableRepo.createDropTable({
          name,
          description: item.description as string | undefined,
        });
        tableId = created.id;
        result.created++;
      }

      // Replace entries: delete existing, create new
      const existingEntries = await dropTableRepo.getEntriesForDropTable(tableId);
      for (const entry of existingEntries) {
        await dropTableRepo.deleteEntry(tableId, entry.id);
      }

      const entries = (item.entries as unknown[]) || [];
      for (const entryRaw of entries) {
        const entry = entryRaw as Record<string, unknown>;
        let itemTemplateId: number | null = null;

        if (entry.itemName) {
          const id = itemNameToId.get((entry.itemName as string).toLowerCase());
          if (!id) {
            result.errors.push(`Drop table "${name}": item "${entry.itemName}" not found`);
            continue;
          }
          itemTemplateId = id;
        }

        await dropTableRepo.createEntry({
          dropTableId: tableId,
          itemTemplateId,
          dropChance: entry.dropChance as number,
          minQuantity: entry.minQuantity as number | undefined,
          maxQuantity: entry.maxQuantity as number | undefined,
          currencyMin: entry.currencyMin as number | undefined,
          currencyMax: entry.currencyMax as number | undefined,
          allowedDenominations: entry.allowedDenominations as string[] | undefined,
        } as unknown as Parameters<typeof dropTableRepo.createEntry>[0]);
      }
    } catch (err) {
      result.errors.push(`DropTable "${item.name}": ${(err as Error).message}`);
      result.skipped++;
    }
  }
  return result;
}

// Deferred room data for cross-area exit resolution
const deferredRoomFiles: { filePath: string; data: unknown[] }[] = [];

async function importRooms(data: unknown[], filePath: string): Promise<ImportResult> {
  const result: ImportResult = { file: 'rooms.json', created: 0, updated: 0, skipped: 0, errors: [] };

  // Phase 1: Upsert all rooms by tag
  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const tag = item.tag as string | null;
      if (!tag) {
        result.errors.push(`Room "${item.name}": no tag, skipping`);
        result.skipped++;
        continue;
      }

      const existing = await roomRepo.getRoomByTag(tag);
      const input = {
        name: item.name as string,
        description: item.description as string | undefined,
        area: item.area as string | undefined,
        terrain: item.terrain as string | undefined,
        features: item.features as Record<string, unknown> | undefined,
        tag,
      };

      if (existing) {
        await roomRepo.updateRoom(existing.id, input);
        result.updated++;
      } else {
        await roomRepo.createRoom(input);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Room "${item.tag || item.name}": ${(err as Error).message}`);
      result.skipped++;
    }
  }

  // Defer exit/door creation until all room files are imported
  deferredRoomFiles.push({ filePath, data });

  return result;
}

/**
 * Process deferred exits and doors for all room files.
 * Called after all room files are imported so cross-area tags are resolvable.
 */
async function processDeferredRoomExits(): Promise<void> {
  if (deferredRoomFiles.length === 0) return;

  console.log('\n  Resolving cross-area exits and doors...');
  const tagToId = await roomRepo.getTagToIdMap();

  for (const { filePath, data: fileData } of deferredRoomFiles) {
    const result: ImportResult = { file: filePath, created: 0, updated: 0, skipped: 0, errors: [] };

    for (const raw of fileData) {
      const item = raw as Record<string, unknown>;
      const tag = item.tag as string | null;
      if (!tag) continue;

      const fromId = tagToId.get(tag);
      if (!fromId) continue;

      // Delete existing exits for this room before re-creating
      const existingExits = await roomRepo.getRoomExits(fromId);
      for (const exit of existingExits) {
        await roomRepo.deleteExit(fromId, exit.direction);
      }

      // Create exits
      const exits = (item.exits as unknown[]) || [];
      for (const exitRaw of exits) {
        const exit = exitRaw as Record<string, unknown>;
        const toTag = exit.toTag as string | null;
        if (!toTag) continue;

        const toId = tagToId.get(toTag);
        if (!toId) {
          result.errors.push(`Room "${tag}" exit ${exit.direction}: target tag "${toTag}" not found`);
          continue;
        }

        try {
          await roomRepo.createExit({
            fromRoomId: fromId,
            toRoomId: toId,
            direction: exit.direction as string,
          });
        } catch (err) {
          const msg = (err as Error).message || '';
          // Only suppress duplicate key violations (Postgres error code 23505)
          if (!msg.includes('duplicate') && !msg.includes('unique') && !msg.includes('23505')) {
            result.errors.push(`Room "${tag}" exit ${exit.direction}: ${msg}`);
          }
        }
      }

      // Create doors — track which directions we touch so we can remove stale ones
      const doors = (item.doors as unknown[]) || [];
      const importedDoorDirections = new Set<string>();
      for (const doorRaw of doors) {
        const door = doorRaw as Record<string, unknown>;
        if (!door.entryDirection) {
          result.errors.push(`Room "${tag}": door "${door.name}" missing entryDirection, skipping`);
          continue;
        }
        const entryDir = (door.entryDirection as string).toLowerCase();
        importedDoorDirections.add(entryDir);
        const exitTag = door.exitTag as string | null;
        const exitRoomId = exitTag ? (tagToId.get(exitTag) ?? null) : null;

        // Check if a door already exists for this room + direction
        const existingDoor = await doorRepo.getDoorByRoomAndDirection(fromId, entryDir);
        if (existingDoor) {
          // Update existing door
          try {
            await doorRepo.updateDoor(existingDoor.id, {
              name: door.name as string,
              displayName: door.displayName as string | null | undefined,
              doorType: door.doorType as string,
              description: door.description as string | undefined,
              exitRoomId,
              exitDirection: door.exitDirection as string | null | undefined,
              defaultState: door.defaultState as string | undefined,
              autoResetSeconds: door.autoResetSeconds as number | null | undefined,
              hasLock: door.hasLock as boolean | undefined,
              keyItemTag: door.keyItemTag as string | undefined,
              pickDifficultyMin: door.pickDifficultyMin as number | undefined,
              pickDifficultyMax: door.pickDifficultyMax as number | undefined,
              bashDifficulty: door.bashDifficulty as number | undefined,
              isHidden: door.isHidden as boolean | undefined,
              triggerText: door.triggerText as string | undefined,
              passageMessageSelf: door.passageMessageSelf as string | undefined,
              passageMessageRoom: door.passageMessageRoom as string | undefined,
              itemDisplayName: door.itemDisplayName as string | undefined,
              isTemporary: door.isTemporary as boolean | undefined,
              spawnTriggerText: door.spawnTriggerText as string | undefined,
              durationSeconds: door.durationSeconds as number | null | undefined,
              appearMessage: door.appearMessage as string | undefined,
              disappearMessage: door.disappearMessage as string | undefined,
              requiredLevel: door.requiredLevel as number | null | undefined,
              maxLevel: door.maxLevel as number | null | undefined,
              requiredClasses: door.requiredClasses as string[] | null | undefined,
              requiredQuestFlag: door.requiredQuestFlag as string | null | undefined,
              requiredItemTag: door.requiredItemTag as string | null | undefined,
              denialMessage: door.denialMessage as string | null | undefined,
            } as unknown as Parameters<typeof doorRepo.updateDoor>[1]);
          } catch (err) {
            result.errors.push(`Door "${door.name}" update in room "${tag}": ${(err as Error).message}`);
          }
        } else {
          try {
            await doorRepo.createDoor({
              name: door.name as string,
              displayName: door.displayName as string | null | undefined,
              doorType: door.doorType as string,
              description: door.description as string | undefined,
              entryRoomId: fromId,
              entryDirection: door.entryDirection as string,
              exitRoomId,
              exitDirection: door.exitDirection as string | null | undefined,
              defaultState: door.defaultState as string | undefined,
              autoResetSeconds: door.autoResetSeconds as number | null | undefined,
              hasLock: door.hasLock as boolean | undefined,
              keyItemTag: door.keyItemTag as string | undefined,
              pickDifficultyMin: door.pickDifficultyMin as number | undefined,
              pickDifficultyMax: door.pickDifficultyMax as number | undefined,
              bashDifficulty: door.bashDifficulty as number | undefined,
              isHidden: door.isHidden as boolean | undefined,
              triggerText: door.triggerText as string | undefined,
              passageMessageSelf: door.passageMessageSelf as string | undefined,
              passageMessageRoom: door.passageMessageRoom as string | undefined,
              itemDisplayName: door.itemDisplayName as string | undefined,
              isTemporary: door.isTemporary as boolean | undefined,
              spawnTriggerText: door.spawnTriggerText as string | undefined,
              durationSeconds: door.durationSeconds as number | null | undefined,
              appearMessage: door.appearMessage as string | undefined,
              disappearMessage: door.disappearMessage as string | undefined,
              requiredLevel: door.requiredLevel as number | null | undefined,
              maxLevel: door.maxLevel as number | null | undefined,
              requiredClasses: door.requiredClasses as string[] | null | undefined,
              requiredQuestFlag: door.requiredQuestFlag as string | null | undefined,
              requiredItemTag: door.requiredItemTag as string | null | undefined,
              denialMessage: door.denialMessage as string | null | undefined,
            } as unknown as Parameters<typeof doorRepo.createDoor>[0]);
          } catch (err) {
            result.errors.push(`Door "${door.name}" in room "${tag}": ${(err as Error).message}`);
          }
        }
      }

      // Delete stale doors that exist in DB but not in import data
      const existingDoors = await doorRepo.getDoorsFromRoom(fromId);
      for (const existing of existingDoors) {
        if (!importedDoorDirections.has(existing.entryDirection.toLowerCase())) {
          await doorRepo.deleteDoor(existing.id);
        }
      }
    }

    // Merge exit/door results into the original room file result
    const originalResult = results.find(r => r.file === filePath);
    if (originalResult) {
      originalResult.errors.push(...result.errors);
    } else {
      results.push(result);
    }

    if (result.errors.length > 0) {
      console.log(`  ${filePath} exits/doors: ${result.errors.length} error(s)`);
      for (const err of result.errors) {
        console.log(`    ERROR: ${err}`);
      }
    }
  }
}

async function importNpcs(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { file: 'npcs.json', created: 0, updated: 0, skipped: 0, errors: [] };

  // Build lookup maps
  const tagToId = await roomRepo.getTagToIdMap();
  const allItems = await itemRepo.getAllTemplates();
  const itemNameToId = new Map<string, number>();
  for (const item of allItems) {
    itemNameToId.set(item.name.toLowerCase(), item.id);
  }

  const allSpells = await spellRepo.getAllSpells();
  const spellMnemonicToId = new Map<string, number>();
  for (const spell of allSpells) {
    spellMnemonicToId.set(spell.mnemonic.toLowerCase(), spell.id);
  }

  const allDropTables = await dropTableRepo.getAllDropTables();
  const dropTableNameToId = new Map<string, number>();
  for (const dt of allDropTables) {
    dropTableNameToId.set(dt.name.toLowerCase(), dt.id);
  }

  const allFactions = await factionRepo.getAllFactions();
  const factionNameToId = new Map<string, number>();
  for (const f of allFactions) {
    factionNameToId.set(f.name.toLowerCase(), f.id);
  }

  // Load existing NPC templates for name matching
  const existingTemplates = await npcRepo.getAllTemplates();
  const existingByName = new Map(existingTemplates.map(t => [t.name.toLowerCase(), t]));

  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    try {
      const name = item.name as string;
      if (!name) { result.skipped++; continue; }

      // Resolve FK references
      let spawnRoomId: number | null = null;
      if (item.spawnRoomTag) {
        spawnRoomId = tagToId.get(item.spawnRoomTag as string) ?? null;
        if (!spawnRoomId) {
          result.errors.push(`NPC "${name}": spawn room tag "${item.spawnRoomTag}" not found`);
          result.skipped++;
          continue;
        }
      }

      let dropTableId: number | null = null;
      if (item.dropTableName) {
        dropTableId = dropTableNameToId.get((item.dropTableName as string).toLowerCase()) ?? null;
        if (!dropTableId) {
          result.errors.push(`NPC "${name}": drop table "${item.dropTableName}" not found, setting to null`);
        }
      }

      let primaryFactionId: number | null = null;
      if (item.primaryFactionName) {
        primaryFactionId = factionNameToId.get((item.primaryFactionName as string).toLowerCase()) ?? null;
        if (!primaryFactionId) {
          result.errors.push(`NPC "${name}": faction "${item.primaryFactionName}" not found, setting to null`);
        }
      }

      const templateInput: Record<string, unknown> = {
        name,
        description: item.description,
        spawnRoomId,
        maxHealth: item.maxHealth ?? item.health,
        hostile: item.hostile,
        respawnTime: item.respawnTime,
        level: item.level,
        experienceReward: item.experienceReward,
        maxMana: item.maxMana,
        baseAccuracy: item.baseAccuracy,
        baseDefense: item.baseDefense,
        baseCritChance: item.baseCritChance,
        baseDodge: item.baseDodge,
        damageReduction: item.damageReduction,
        traits: item.traits,
        fleeEnabled: item.fleeEnabled,
        fleeHpPercent: item.fleeHpPercent,
        callForHelpChance: item.callForHelpChance,
        maxActive: item.maxActive,
        interactable: item.interactable,
        allowedAreas: item.allowedAreas,
        roamEnabled: item.roamEnabled,
        roamInterval: item.roamInterval,
        roamChance: item.roamChance,
        dropTableId,
        essenceReward: item.essenceReward,
        essenceClass: item.essenceClass,
        leaveCorpse: item.leaveCorpse,
        corpseDuration: item.corpseDuration,
        augmentations: item.augmentations,
        enterRoomMessage: item.enterRoomMessage,
        exitRoomMessage: item.exitRoomMessage,
        spawnMessage: item.spawnMessage,
        primaryFactionId,
        merchantEnabled: item.merchantEnabled,
        properName: item.properName,
        spellPower: item.spellPower,
        enabled: item.enabled as boolean | undefined,
      };

      const existing = existingByName.get(name.toLowerCase());

      // Resolve spells before the transaction so errors are non-fatal
      const spells = (item.spells as unknown[]) || [];
      const resolvedSpells: Parameters<typeof npcSpellRepo.replaceSpells>[1] = [];
      for (const spellRaw of spells) {
        const spell = spellRaw as Record<string, unknown>;
        const mnemonic = spell.spellMnemonic as string;
        if (!mnemonic) continue;
        const spellId = spellMnemonicToId.get(mnemonic.toLowerCase());
        if (!spellId) {
          result.errors.push(`NPC "${name}": spell mnemonic "${mnemonic}" not found`);
          continue;
        }
        resolvedSpells.push({
          spellId,
          priority: spell.priority as number | undefined,
          castChance: spell.castChance as number | undefined,
          conditionType: spell.conditionType as string | undefined,
          conditionValue: spell.conditionValue as number | undefined,
          cooldownRounds: spell.cooldownRounds as number | undefined,
        });
      }

      // Wrap template + attacks + spells in a transaction so partial writes
      // are rolled back on failure. Merchant repos don't accept a client
      // param yet, so they run outside the transaction.
      const npcId = await withTransaction(async (client) => {
        let id: number;
        if (existing) {
          await npcRepo.updateTemplate(existing.id, templateInput as unknown as Parameters<typeof npcRepo.updateTemplate>[1], client);
          id = existing.id;
          result.updated++;
        } else {
          const created = await npcRepo.createTemplate(templateInput as unknown as Parameters<typeof npcRepo.createTemplate>[0], client);
          id = created.id;
          result.created++;
        }

        // Replace attacks (always replace, even with empty array to clear old data)
        const attacks = (item.attacks as unknown[]) || [];
        await npcRepo.replaceAttacks(id, attacks as unknown as Parameters<typeof npcRepo.replaceAttacks>[1], client);

        // Replace spells
        await npcSpellRepo.replaceSpells(id, resolvedSpells, client);

        return id;
      });

      // Merchant inventory/responses (outside transaction — repos lack client param)
      // Only delete+recreate for merchant NPCs to avoid wiping data for non-merchants.
      if (item.merchantEnabled) {
        try {
          await merchantRepo.deleteAllInventoryForTemplate(npcId);
          await merchantResponseRepo.deleteAllResponsesForTemplate(npcId);
        } catch (err) {
          result.errors.push(`NPC "${name}": failed to clear merchant data: ${(err as Error).message}`);
        }
      }

      if (item.merchantEnabled) {
        const inventory = (item.merchantInventory as unknown[]) || [];
        for (const invRaw of inventory) {
          const inv = invRaw as Record<string, unknown>;
          const itemName = inv.itemName as string;
          if (!itemName) continue;
          const itemTemplateId = itemNameToId.get(itemName.toLowerCase());
          if (!itemTemplateId) {
            result.errors.push(`NPC "${name}": merchant item "${itemName}" not found`);
            continue;
          }
          try {
            await merchantRepo.createInventoryEntry({
              npcTemplateId: npcId,
              itemTemplateId,
              maxStock: inv.maxStock as number,
              restockChance: inv.restockChance as number,
            } as unknown as Parameters<typeof merchantRepo.createInventoryEntry>[0]);
          } catch (err) {
            result.errors.push(`NPC "${name}": merchant inventory "${itemName}": ${(err as Error).message}`);
          }
        }

        const responses = (item.merchantResponses as unknown[]) || [];
        for (const respRaw of responses) {
          const resp = respRaw as Record<string, unknown>;
          try {
            await merchantResponseRepo.createResponse({
              npcTemplateId: npcId,
              triggerKeywords: resp.triggerKeywords as string[],
              response: resp.response as string,
            });
          } catch (err) {
            result.errors.push(`NPC "${name}": merchant response: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(`NPC "${item.name}": ${(err as Error).message}`);
      result.skipped++;
    }
  }

  return result;
}

// ============================================================================
// File → importer dispatch
// ============================================================================

async function importFile(relativePath: string): Promise<void> {
  const file = readJsonFile(relativePath);
  if (!file) {
    results.push({ file: relativePath, created: 0, updated: 0, skipped: 0, errors: [`File not found`] });
    return;
  }

  if (file.data.length === 0) {
    results.push({ file: relativePath, created: 0, updated: 0, skipped: 0, errors: [] });
    return;
  }

  let importResult: ImportResult;

  switch (file.type) {
    case 'spells':
      importResult = await importSpells(file.data);
      break;
    case 'status_effects':
      importResult = await importStatusEffects(file.data);
      break;
    case 'actions':
      importResult = await importActions(file.data);
      break;
    case 'classes':
      importResult = await importClasses(file.data);
      break;
    case 'races':
      importResult = await importRaces(file.data);
      break;
    case 'progression_table':
      importResult = await importProgressionTable(file.data);
      break;
    case 'items':
      importResult = await importItems(file.data);
      break;
    case 'factions':
      importResult = await importFactions(file.data);
      break;
    case 'drop_tables':
      importResult = await importDropTables(file.data);
      break;
    case 'rooms':
      importResult = await importRooms(file.data, relativePath);
      break;
    case 'npcs':
      importResult = await importNpcs(file.data);
      break;
    default:
      importResult = { file: relativePath, created: 0, updated: 0, skipped: 0, errors: [`Unknown type: ${file.type}`] };
  }

  importResult.file = relativePath;
  results.push(importResult);

  const parts = [`${importResult.created} created`, `${importResult.updated} updated`];
  if (importResult.skipped > 0) parts.push(`${importResult.skipped} skipped`);
  if (importResult.errors.length > 0) parts.push(`${importResult.errors.length} error(s)`);
  console.log(`  ${relativePath}: ${parts.join(', ')}`);

  for (const err of importResult.errors) {
    console.log(`    ERROR: ${err}`);
  }
}

/**
 * Set game settings that depend on imported room data.
 * Uses room tags to look up IDs, so this must run after all rooms are imported.
 */
async function configureGameSettings(): Promise<void> {
  const tagToId = await roomRepo.getTagToIdMap();

  // Default starting room for new characters (Hearthstead Village Center)
  const startingRoomId = tagToId.get('hs_hamlet_s');
  if (startingRoomId) {
    await query(
      `INSERT INTO game_settings (key, value) VALUES ('default_starting_room_id', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(startingRoomId)]
    );
    console.log(`  Default starting room: Hearthstead Village Center (ID ${startingRoomId})`);
  }

  // Default respawn room (Hall of the Dead — fallback for areas without their own)
  const respawnRoomId = tagToId.get('cathedral_halls_dead');
  if (respawnRoomId) {
    await query(
      `INSERT INTO game_settings (key, value) VALUES ('default_respawn_room_id', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(respawnRoomId)]
    );
    console.log(`  Default respawn room: Halls of the Dead (ID ${respawnRoomId})`);
  }
}

async function main(): Promise<void> {
  console.log('=== Game Data Import ===\n');

  const manifestPath = join(DATA_DIR, '_manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('No _manifest.json found in data/. Run npm run data:export first.');
    process.exit(1);
  }

  let manifest: { version: string; import_order: string[] };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to parse _manifest.json: ${(err as Error).message}`);
    process.exit(1);
  }
  const importOrder: string[] = manifest.import_order;

  console.log(`Manifest version: ${manifest.version}`);
  console.log(`Files to import: ${importOrder.length}\n`);

  for (const filePath of importOrder) {
    await importFile(filePath);
  }

  // Process deferred exits/doors now that all rooms from all area files exist
  await processDeferredRoomExits();

  // Print summary
  console.log('\n=== Import Summary ===');
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const r of results) {
    totalCreated += r.created;
    totalUpdated += r.updated;
    totalSkipped += r.skipped;
    totalErrors += r.errors.length;
  }

  console.log(`  Total: ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} error(s)`);

  if (totalErrors > 0) {
    console.log('\nErrors:');
    for (const r of results) {
      for (const err of r.errors) {
        console.log(`  ${r.file}: ${err}`);
      }
    }
  }

  // Configure game settings based on imported rooms
  await configureGameSettings();

  console.log('\n=== Import Complete ===');

  const pool = getPool();
  await pool.end();
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
