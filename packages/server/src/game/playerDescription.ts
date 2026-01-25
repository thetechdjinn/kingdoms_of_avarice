/**
 * Player Description Module
 *
 * Generates dynamic descriptions of players based on their stats, race, class,
 * and appearance settings. Used when looking at other players.
 */

import { Character, Gender, EquipmentSlot, ItemInstance } from '@koa/shared';
import { wordWrap } from '../utils/textFormat.js';
import { colors } from '../utils/colors.js';

// Stat adjective thresholds and descriptions
interface StatThreshold {
  min: number;
  adjective: string;
}

// Strength adjectives (describes physical build)
const STRENGTH_ADJECTIVES: StatThreshold[] = [
  { min: 110, adjective: 'physically Godlike' },
  { min: 100, adjective: 'Herculean' },
  { min: 90, adjective: 'heroically proportioned' },
  { min: 80, adjective: 'powerfully built' },
  { min: 70, adjective: 'muscular' },
  { min: 60, adjective: 'well built' },
  { min: 50, adjective: 'moderately built' },
  { min: 40, adjective: 'slightly built' },
  { min: 30, adjective: 'weak' },
  { min: 0, adjective: 'puny' },
];

// Constitution adjectives (describes size/frame)
const CONSTITUTION_ADJECTIVES: StatThreshold[] = [
  { min: 100, adjective: 'colossal' },
  { min: 90, adjective: 'gigantic' },
  { min: 80, adjective: 'massive' },
  { min: 70, adjective: 'solid' },
  { min: 60, adjective: 'stout' },
  { min: 50, adjective: 'healthy' },
  { min: 40, adjective: 'thin' },
  { min: 0, adjective: 'frail' },
];

// Dexterity adjectives (describes movement speed)
const DEXTERITY_ADJECTIVES: StatThreshold[] = [
  { min: 100, adjective: 'blindingly fast' },
  { min: 90, adjective: 'with catlike agility' },
  { min: 80, adjective: 'with uncanny speed' },
  { min: 70, adjective: 'very swiftly' },
  { min: 60, adjective: 'gracefully' },
  { min: 50, adjective: 'cautiously' },
  { min: 40, adjective: 'sluggishly' },
  { min: 30, adjective: 'clumsily' },
  { min: 0, adjective: 'slowly' },
];

// Intellect adjectives (describes mental ability)
const INTELLECT_ADJECTIVES: StatThreshold[] = [
  { min: 100, adjective: 'all-knowing' },
  { min: 90, adjective: 'a genius' },
  { min: 80, adjective: 'brilliant' },
  { min: 70, adjective: 'extremely clever' },
  { min: 60, adjective: 'bright' },
  { min: 50, adjective: 'intelligent' },
  { min: 40, adjective: 'slightly dull' },
  { min: 30, adjective: 'quite stupid' },
  { min: 0, adjective: 'utterly moronic' },
];

// Wisdom adjectives (describes worldliness/temperament)
const WISDOM_ADJECTIVES: StatThreshold[] = [
  { min: 100, adjective: 'one with the Gods' },
  { min: 90, adjective: 'spiritually enlightened' },
  { min: 80, adjective: 'wise beyond {possessive} years' },
  { min: 70, adjective: 'has a worldly air' },
  { min: 60, adjective: 'quite wise' },
  { min: 50, adjective: 'fairly knowledgeable' },
  { min: 40, adjective: 'a little naive' },
  { min: 30, adjective: 'rather selfish' },
  { min: 0, adjective: 'selfish and hot-tempered' },
];

// Charisma adjectives (describes personality/appearance appeal)
const CHARISMA_ADJECTIVES: StatThreshold[] = [
  { min: 100, adjective: 'overwhelmingly charismatic. You almost drop to your knees in wonder at the sight of {object}' },
  { min: 90, adjective: 'incredibly charismatic. You are almost overpowered by {possessive} strong personality' },
  { min: 80, adjective: 'extremely likeable, and fairly radiates charisma' },
  { min: 70, adjective: "charismatic and outgoing. You can't help but like {object}" },
  { min: 60, adjective: 'quite attractive and pleasant to be around' },
  { min: 50, adjective: 'likeable in an unassuming sort of way' },
  { min: 40, adjective: 'unfriendly and aloof' },
  { min: 30, adjective: 'hostile and rather unappealing' },
  { min: 0, adjective: 'openly hostile and quite revolting' },
];

// HP status descriptions
interface HpThreshold {
  minPercent: number;
  status: string;
}

const HP_STATUS: HpThreshold[] = [
  { minPercent: 100, status: 'unwounded' },
  { minPercent: 75, status: 'slightly wounded' },
  { minPercent: 50, status: 'moderately wounded' },
  { minPercent: 25, status: 'severely wounded' },
  { minPercent: 1, status: 'critically wounded' },
  { minPercent: -Infinity, status: 'mortally wounded' },
];

// Equipment slot display names
const SLOT_DISPLAY_NAMES: Record<string, string> = {
  [EquipmentSlot.HEAD]: 'Head',
  [EquipmentSlot.FACE]: 'Face',
  [EquipmentSlot.NECK]: 'Neck',
  [EquipmentSlot.BACK]: 'Back',
  [EquipmentSlot.BODY]: 'Torso',
  [EquipmentSlot.ARMS]: 'Arms',
  [EquipmentSlot.HANDS]: 'Hands',
  [EquipmentSlot.WRIST_LEFT]: 'Left Wrist',
  [EquipmentSlot.WRIST_RIGHT]: 'Right Wrist',
  [EquipmentSlot.FINGER_LEFT]: 'Finger',
  [EquipmentSlot.FINGER_RIGHT]: 'Finger',
  [EquipmentSlot.WAIST]: 'Waist',
  [EquipmentSlot.LEGS]: 'Legs',
  [EquipmentSlot.FEET]: 'Feet',
  [EquipmentSlot.MAIN_HAND]: 'Weapon Hand',
  [EquipmentSlot.OFF_HAND]: 'Off Hand',
  [EquipmentSlot.HELD]: 'Nowhere',
};

// Pronoun sets based on gender
export interface Pronouns {
  subject: string;   // he/she/they
  object: string;    // him/her/them
  possessive: string; // his/her/their
}

/**
 * Get pronoun set based on gender
 */
export function getPronouns(gender: Gender): Pronouns {
  switch (gender) {
    case 'female':
      return { subject: 'She', object: 'her', possessive: 'her' };
    case 'male':
    default:
      return { subject: 'He', object: 'him', possessive: 'his' };
  }
}

/**
 * Get an adjective from a stat threshold table based on value
 */
function getStatAdjective(value: number, thresholds: StatThreshold[]): string {
  for (const threshold of thresholds) {
    if (value >= threshold.min) {
      return threshold.adjective;
    }
  }
  return thresholds[thresholds.length - 1].adjective;
}

/**
 * Get HP status text based on current and max health
 */
export function getHpStatus(current: number, max: number): string {
  const percent = max > 0 ? (current / max) * 100 : 0;

  for (const threshold of HP_STATUS) {
    if (percent >= threshold.minPercent) {
      return threshold.status;
    }
  }
  return 'mortally wounded';
}

/**
 * Replace pronoun placeholders in a string
 */
function replacePronounPlaceholders(text: string, pronouns: Pronouns): string {
  return text
    .replace(/\{subject\}/g, pronouns.subject)
    .replace(/\{object\}/g, pronouns.object)
    .replace(/\{possessive\}/g, pronouns.possessive);
}

/**
 * Data needed to generate a player description
 */
export interface PlayerDescriptionData {
  character: Character;
  currentHp: number;
  maxHp: number;
  equippedItems: ItemInstance[];
}

/**
 * Generate the full player description paragraph
 */
export function generatePlayerDescription(data: PlayerDescriptionData): string {
  const { character, currentHp, maxHp, equippedItems } = data;
  const pronouns = getPronouns(character.gender || 'male');
  const stats = character.stats;

  // Build full name (first name + last name)
  const fullName = character.lastName ? `${character.name} ${character.lastName}` : character.name;

  // Build the description parts
  const parts: string[] = [];

  // Size (constitution) + build (strength) + race + class
  const sizeAdj = getStatAdjective(stats.constitution, CONSTITUTION_ADJECTIVES);
  const buildAdj = getStatAdjective(stats.strength, STRENGTH_ADJECTIVES);

  // Hair and eye description
  // character.hair is stored as "style color" (e.g., "short black", "long white", "none black")
  let hairDesc = '';
  if (character.hair) {
    const hairParts = character.hair.split(' ');
    const style = hairParts[0];
    const color = hairParts.slice(1).join(' ') || '';

    if (style === 'none') {
      // Bald character - use "a bald head"
      hairDesc = 'a bald head';
    } else {
      // Has hair - format as "long white hair"
      hairDesc = color ? `${style} ${color} hair` : `${style} hair`;
    }
  } else {
    hairDesc = 'a bald head';
  }
  // Handle eye color - strip " eyes" suffix if present (legacy format)
  let eyeColorValue = character.eyeColor || '';
  if (eyeColorValue.endsWith(' eyes')) {
    eyeColorValue = eyeColorValue.slice(0, -5); // Remove " eyes" suffix
  }
  const eyeDesc = eyeColorValue ? `${eyeColorValue} eyes` : 'dark eyes';

  // First sentence: "Name is a [size], [build] [Race] [Class] with [hair] and [eyes]."
  parts.push(`${fullName} is a ${sizeAdj}, ${buildAdj} ${character.race} ${character.class} with ${hairDesc} and ${eyeDesc}.`);

  // Movement (dexterity): "[Subject] moves [dexterity adverb]"
  const dexAdj = getStatAdjective(stats.dexterity, DEXTERITY_ADJECTIVES);
  parts.push(`${pronouns.subject} moves ${dexAdj},`);

  // Charisma: "and is [charisma description]."
  let charismaAdj = getStatAdjective(stats.charisma, CHARISMA_ADJECTIVES);
  charismaAdj = replacePronounPlaceholders(charismaAdj, pronouns);
  parts.push(`and is ${charismaAdj}.`);

  // Intelligence: "[Name] appears to be [intellect description]"
  const intAdj = getStatAdjective(stats.intelligence, INTELLECT_ADJECTIVES);
  parts.push(`${fullName} appears to be ${intAdj}`);

  // Wisdom: "and [wisdom description]."
  let wisAdj = getStatAdjective(stats.wisdom, WISDOM_ADJECTIVES);
  wisAdj = replacePronounPlaceholders(wisAdj, pronouns);
  // Handle wisdom adjectives that start with verbs vs adjectives
  if (wisAdj.startsWith('has') || wisAdj.startsWith('one')) {
    parts.push(`and ${wisAdj}.`);
  } else {
    parts.push(`and seems ${wisAdj}.`);
  }

  // Health status: "[Subject] is [hp status]."
  const hpStatus = getHpStatus(currentHp, maxHp);
  parts.push(`${pronouns.subject} is ${hpStatus}.`);

  // Join all parts with spaces
  const description = parts.join(' ');

  // Build the equipment section
  const equipmentSection = formatEquippedItems(equippedItems);

  // Combine name header, wrapped description, and equipment
  // Colors: Name bracket = cyan, description = white, "equipped with" = yellow
  const lines: string[] = [];
  lines.push(colors.cyan(`[ ${fullName} ]`));
  lines.push(colors.white(wordWrap(description, 80)));

  if (equipmentSection) {
    lines.push('');
    lines.push(colors.brown(`${pronouns.subject} is equipped with:`));
    lines.push('');
    lines.push(equipmentSection);
  }

  return lines.join('\r\n');
}

/**
 * Format equipped items for display
 * Colors: Item names = green, slot names = blue
 * Layout: Item names left-aligned, slots aligned at fixed column
 */
export function formatEquippedItems(items: ItemInstance[]): string {
  if (!items || items.length === 0) {
    return '';
  }

  const ITEM_COL_WIDTH = 25;  // Fixed width for item name column
  const lines: string[] = [];

  for (const item of items) {
    const itemName = item.template?.name || 'unknown item';
    const slotName = item.equipped_slot ? SLOT_DISPLAY_NAMES[item.equipped_slot] || item.equipped_slot : 'Unknown';
    const paddedItemName = itemName.padEnd(ITEM_COL_WIDTH);
    lines.push(colors.green(paddedItemName) + colors.blue(`(${slotName})`));
  }

  return lines.join('\r\n');
}
