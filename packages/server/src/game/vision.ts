import { EquipmentSlot, ItemType, RacialTrait } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity } from './combatEntity.js';
import { NpcCombatInstance } from './npcManager.js';
import { getEffectModifiers } from './statusEffects.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';

// Darkness band thresholds and display tags
const DARKNESS_BANDS: { min: number; max: number; tag: string; label: string }[] = [
  { min: -75, max: -1, tag: '[Dim]', label: 'Dim' },
  { min: -150, max: -76, tag: '[Dark]', label: 'Dark' },
  { min: -250, max: -151, tag: '[Very Dark]', label: 'Very Dark' },
  { min: -400, max: -251, tag: '[Pitch Black]', label: 'Pitch Black' },
  { min: -500, max: -401, tag: '[Abyssal]', label: 'Abyssal' },
];

/**
 * Get the darkness display tag for a room's darkness level.
 * Currently disabled: darkness is communicated via the "can't see" message,
 * not via tags on room names.
 */
export function getDarknessTag(_darknessLevel: number): string {
  return '';
}

/**
 * Get the darkness band label for a darkness level value.
 */
export function getDarknessLabel(darknessLevel: number): string {
  if (darknessLevel >= 0) return 'Bright';
  for (const band of DARKNESS_BANDS) {
    if (darknessLevel <= band.max && darknessLevel >= band.min) {
      return band.label;
    }
  }
  return 'Abyssal';
}

/**
 * Get a player's race base_vision value.
 * Returns 100 (normal vision) if race or trait not found.
 */
async function getRaceBaseVision(raceId: string): Promise<number> {
  const race = await progressionRepo.getRaceById(raceId);
  if (!race || !race.traits) return 100;

  const traits = race.traits as RacialTrait[];
  const visionTrait = traits.find(t => typeof t === 'object' && t.id === 'base_vision');
  if (visionTrait && typeof visionTrait === 'object' && typeof visionTrait.value === 'number') {
    return visionTrait.value;
  }
  return 100;
}

/**
 * Get vision bonuses from equipped items (single DB query).
 * Returns both the lit light source bonus and the sum of vision_modifier from all items.
 */
async function getEquippedVisionBonuses(characterId: number): Promise<{ lightBonus: number; equipmentBonus: number }> {
  const equipped = await itemRepo.getCharacterEquipped(characterId);
  let lightBonus = 0;
  let equipmentBonus = 0;

  for (const item of equipped) {
    // Lit light source in HELD slot
    if (
      lightBonus === 0 &&
      item.equipped_slot === EquipmentSlot.HELD &&
      item.template?.item_type === ItemType.LIGHT &&
      item.is_lit &&
      item.template.light_data
    ) {
      // Fallback: pre-migration data may still use 'radius' key
      // Convert old radius values: 2 → 100 (torch), 3 → 175 (lantern), else radius * 50
      if (item.template.light_data.vision_bonus != null) {
        lightBonus = item.template.light_data.vision_bonus;
      } else {
        const ld = item.template.light_data as unknown as Record<string, unknown>;
        const radius = typeof ld.radius === 'number' ? ld.radius : 0;
        if (radius > 0) {
          if (radius <= 2) lightBonus = 100;
          else if (radius <= 3) lightBonus = 175;
          else lightBonus = radius * 50;
        }
      }
    }

    // vision_modifier from any equipped item
    equipmentBonus += item.template?.vision_modifier ?? 0;
  }

  return { lightBonus, equipmentBonus };
}

/**
 * Calculate a player's effective vision (sum of all vision sources).
 * effectiveVision = raceBaseVision + statusEffectVisionModifier + heldLightBonus + equipmentVisionBonus
 */
export async function calculateEffectiveVision(socket: AuthenticatedSocket): Promise<number> {
  const baseVision = await getRaceBaseVision(socket.characterRace);
  const effectMods = getEffectModifiers(socket);
  const { lightBonus, equipmentBonus } = socket.characterId
    ? await getEquippedVisionBonuses(socket.characterId)
    : { lightBonus: 0, equipmentBonus: 0 };

  return baseVision + effectMods.visionModifier + lightBonus + equipmentBonus;
}

/**
 * Calculate an NPC's effective vision.
 * Uses template visionLevel as base, plus any active effect modifiers.
 */
export function calculateNpcEffectiveVision(npc: NpcCombatInstance): number {
  const baseVision = npc.template.visionLevel ?? 100;
  const effectMods = getEffectModifiers(npc);
  return baseVision + effectMods.visionModifier;
}

/**
 * Determine if an entity can see given their effective vision and the room's darkness level.
 * net > 0 means they can see. net <= 0 means they can't.
 */
export function canSee(effectiveVision: number, roomDarkness: number): boolean {
  return (roomDarkness + effectiveVision) > 0;
}

/**
 * Determine if a combat entity (player or NPC) can see in a room.
 * Handles the isBlind fast-path, player/NPC branching, and type narrowing.
 */
export async function entityCanSee(entity: CombatEntity, roomDarkness: number): Promise<boolean> {
  const effectMods = getEffectModifiers(entity);
  if (effectMods.isBlind) return false;

  if (isPlayerEntity(entity)) {
    const vision = await calculateEffectiveVision(entity as unknown as AuthenticatedSocket);
    return canSee(vision, roomDarkness);
  }

  const vision = calculateNpcEffectiveVision(entity as unknown as NpcCombatInstance);
  return canSee(vision, roomDarkness);
}

/**
 * Get the "can't see" message based on room darkness level.
 */
export function getBlindMessage(darknessLevel: number): string {
  if (darknessLevel <= -401) {
    return 'An impenetrable darkness surrounds you - you can\'t see anything!';
  }
  if (darknessLevel <= -251) {
    return 'The room is pitch black - you can\'t see anything!';
  }
  return 'The room is very dark - you can\'t see anything!';
}
