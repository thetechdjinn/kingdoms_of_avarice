// ============================================================================
// PROGRESSION ADMIN COMMANDS
// @class, @race, @ability, @talent, @event commands
// ============================================================================

import { MessageType, Role, hasAnyRole } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { colors } from '../utils/colors.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';

interface CommandResponse {
  type: MessageType;
  message: string;
}

// Commands that require Developer role
const progressionCommands = [
  'classes', 'classinfo', 'createclass', 'editclass', 'deleteclass',
  'races', 'raceinfo', 'createrace', 'editrace', 'deleterace',
  'abilities', 'abilityinfo', 'createability', 'editability', 'deleteability',
  'talents', 'talentinfo', 'createtalent', 'edittalent', 'deletetalent',
  'events', 'eventinfo', 'createevent', 'editevent', 'deleteevent',
  'classabilities', 'addclassability', 'removeclassability',
];

export function isProgressionCommand(command: string): boolean {
  return progressionCommands.includes(command.toLowerCase());
}

export async function processProgressionCommand(
  command: string,
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse | null> {
  const userRoles = socket.roles || [];

  if (!hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN])) {
    return { type: MessageType.ERROR, message: 'You do not have permission to use this command. Developer role required.' };
  }

  switch (command.toLowerCase()) {
    // Class commands
    case 'classes':
      return handleListClasses();
    case 'classinfo':
      return handleClassInfo(args);
    case 'createclass':
      return handleCreateClass(args);
    case 'editclass':
      return handleEditClass(args);
    case 'deleteclass':
      return handleDeleteClass(args);

    // Race commands
    case 'races':
      return handleListRaces();
    case 'raceinfo':
      return handleRaceInfo(args);
    case 'createrace':
      return handleCreateRace(args);
    case 'editrace':
      return handleEditRace(args);
    case 'deleterace':
      return handleDeleteRace(args);

    // Ability commands
    case 'abilities':
      return handleListAbilities(args);
    case 'abilityinfo':
      return handleAbilityInfo(args);
    case 'createability':
      return handleCreateAbility(args);
    case 'editability':
      return handleEditAbility(args);
    case 'deleteability':
      return handleDeleteAbility(args);

    // Talent commands
    case 'talents':
      return handleListTalents(args);
    case 'talentinfo':
      return handleTalentInfo(args);
    case 'createtalent':
      return handleCreateTalent(args);
    case 'edittalent':
      return handleEditTalent(args);
    case 'deletetalent':
      return handleDeleteTalent(args);

    // Event commands
    case 'events':
      return handleListEvents();
    case 'eventinfo':
      return handleEventInfo(args);
    case 'createevent':
      return handleCreateEvent(args);
    case 'editevent':
      return handleEditEvent(args);
    case 'deleteevent':
      return handleDeleteEvent(args);

    // Class ability mapping
    case 'classabilities':
      return handleListClassAbilities(args);
    case 'addclassability':
      return handleAddClassAbility(args);
    case 'removeclassability':
      return handleRemoveClassAbility(args);

    default:
      return null;
  }
}

// ============================================================================
// CLASS COMMANDS
// ============================================================================

async function handleListClasses(): Promise<CommandResponse> {
  try {
    const classes = await progressionRepo.getAllClasses();

    if (classes.length === 0) {
      return { type: MessageType.SYSTEM, message: 'No classes defined.' };
    }

    const lines = [
      colors.boldYellow(`Classes (${classes.length} total):`),
      '',
    ];

    for (const cls of classes) {
      const tags = cls.subscribed_tags.join(', ') || 'none';
      lines.push(`  ${colors.boldCyan(cls.class_id)} - ${cls.display_name} (${cls.essence_multiplier}x) [${tags}]`);
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list classes: ${error}` };
  }
}

async function handleClassInfo(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @classinfo <class_id>' };
  }

  try {
    const cls = await progressionRepo.getClassById(args[0]);
    if (!cls) {
      return { type: MessageType.ERROR, message: `Class not found: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow('Class Info:'),
      `  ${colors.boldCyan('ID:')} ${cls.class_id}`,
      `  ${colors.boldCyan('Name:')} ${cls.display_name}`,
      `  ${colors.boldCyan('Description:')} ${cls.description || 'none'}`,
      `  ${colors.boldCyan('Essence Multiplier:')} ${cls.essence_multiplier}x`,
      `  ${colors.boldCyan('Tags:')} ${cls.subscribed_tags.join(', ') || 'none'}`,
      `  ${colors.boldCyan('Base Stats:')} ${cls.base_stats ? JSON.stringify(cls.base_stats) : 'none'}`,
      `  ${colors.boldCyan('Talent Tree:')} ${cls.talent_tree_id || 'none'}`,
    ];

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to get class info: ${error}` };
  }
}

async function handleCreateClass(args: string[]): Promise<CommandResponse> {
  // @createclass <class_id> <display_name> [essence_multiplier]
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @createclass <class_id> <display_name> [essence_multiplier]' };
  }

  const classId = args[0];
  const multiplier = args.length > 2 ? parseFloat(args[args.length - 1]) : NaN;
  const displayName = isNaN(multiplier) ? args.slice(1).join(' ') : args.slice(1, -1).join(' ');
  const essenceMultiplier = isNaN(multiplier) ? 1.0 : multiplier;

  try {
    const cls = await progressionRepo.createClass({
      class_id: classId,
      display_name: displayName,
      essence_multiplier: essenceMultiplier,
      subscribed_tags: [],
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Class created:')} ${cls.display_name} (${cls.class_id})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create class: ${error}` };
  }
}

async function handleEditClass(args: string[]): Promise<CommandResponse> {
  // @editclass <class_id> <field> <value>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @editclass <class_id> <field> <value>\r\nFields: name, desc, multiplier, tags' };
  }

  const classId = args[0];
  const field = args[1].toLowerCase();
  const value = args.slice(2).join(' ');

  try {
    let updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates = { display_name: value };
        break;
      case 'desc':
      case 'description':
        updates = { description: value };
        break;
      case 'multiplier': {
        const multiplierVal = parseFloat(value);
        if (isNaN(multiplierVal)) {
          return { type: MessageType.ERROR, message: 'Invalid multiplier value. Must be a number.' };
        }
        updates = { essence_multiplier: multiplierVal };
        break;
      }
      case 'tags':
        updates = { subscribed_tags: value.split(',').map(t => t.trim()) };
        break;
      default:
        return { type: MessageType.ERROR, message: `Unknown field: ${field}` };
    }

    const cls = await progressionRepo.updateClass(classId, updates);
    if (!cls) {
      return { type: MessageType.ERROR, message: `Class not found: ${classId}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Class updated:')} ${cls.display_name}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update class: ${error}` };
  }
}

async function handleDeleteClass(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @deleteclass <class_id>' };
  }

  try {
    const deleted = await progressionRepo.deleteClass(args[0]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Class not found: ${args[0]}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Class deleted:')} ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete class: ${error}` };
  }
}

// ============================================================================
// RACE COMMANDS
// ============================================================================

async function handleListRaces(): Promise<CommandResponse> {
  try {
    const races = await progressionRepo.getAllRaces();

    if (races.length === 0) {
      return { type: MessageType.SYSTEM, message: 'No races defined.' };
    }

    const lines = [
      colors.boldYellow(`Races (${races.length} total):`),
      '',
    ];

    for (const race of races) {
      const playable = race.playable ? '' : ' (NPC)';
      lines.push(`  ${colors.boldCyan(race.race_id)} - ${race.display_name}${playable}`);
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list races: ${error}` };
  }
}

async function handleRaceInfo(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @raceinfo <race_id>' };
  }

  try {
    const race = await progressionRepo.getRaceById(args[0]);
    if (!race) {
      return { type: MessageType.ERROR, message: `Race not found: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow('Race Info:'),
      `  ${colors.boldCyan('ID:')} ${race.race_id}`,
      `  ${colors.boldCyan('Name:')} ${race.display_name}`,
      `  ${colors.boldCyan('Description:')} ${race.description || 'none'}`,
      `  ${colors.boldCyan('Playable:')} ${race.playable ? 'Yes' : 'No'}`,
      `  ${colors.boldCyan('Stat Modifiers:')} ${race.stat_modifiers ? JSON.stringify(race.stat_modifiers) : 'none'}`,
      `  ${colors.boldCyan('Traits:')} ${race.traits?.join(', ') || 'none'}`,
      `  ${colors.boldCyan('Allowed Classes:')} ${race.allowed_classes?.join(', ') || 'all'}`,
    ];

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to get race info: ${error}` };
  }
}

async function handleCreateRace(args: string[]): Promise<CommandResponse> {
  // @createrace <race_id> <display_name>
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @createrace <race_id> <display_name>' };
  }

  const raceId = args[0];
  const displayName = args.slice(1).join(' ');

  try {
    const race = await progressionRepo.createRace({
      race_id: raceId,
      display_name: displayName,
      playable: true,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Race created:')} ${race.display_name} (${race.race_id})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create race: ${error}` };
  }
}

async function handleEditRace(args: string[]): Promise<CommandResponse> {
  // @editrace <race_id> <field> <value>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @editrace <race_id> <field> <value>\r\nFields: name, desc, playable, stats, traits' };
  }

  const raceId = args[0];
  const field = args[1].toLowerCase();
  const value = args.slice(2).join(' ');

  try {
    let updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates = { display_name: value };
        break;
      case 'desc':
      case 'description':
        updates = { description: value };
        break;
      case 'playable':
        updates = { playable: value.toLowerCase() === 'true' || value === '1' };
        break;
      case 'stats': {
        try {
          updates = { stat_modifiers: JSON.parse(value) };
        } catch {
          return { type: MessageType.ERROR, message: 'Invalid JSON for stats. Example: {"strength":1,"dexterity":-1}' };
        }
        break;
      }
      case 'traits':
        updates = { traits: value.split(',').map(t => t.trim()) };
        break;
      default:
        return { type: MessageType.ERROR, message: `Unknown field: ${field}` };
    }

    const race = await progressionRepo.updateRace(raceId, updates);
    if (!race) {
      return { type: MessageType.ERROR, message: `Race not found: ${raceId}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Race updated:')} ${race.display_name}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update race: ${error}` };
  }
}

async function handleDeleteRace(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @deleterace <race_id>' };
  }

  try {
    const deleted = await progressionRepo.deleteRace(args[0]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Race not found: ${args[0]}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Race deleted:')} ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete race: ${error}` };
  }
}

// ============================================================================
// ABILITY COMMANDS
// ============================================================================

async function handleListAbilities(args: string[]): Promise<CommandResponse> {
  try {
    const abilities = args.length > 0
      ? await progressionRepo.getAbilitiesByType(args[0] as 'skill' | 'spell' | 'technique' | 'passive')
      : await progressionRepo.getAllAbilities();

    if (abilities.length === 0) {
      return { type: MessageType.SYSTEM, message: 'No abilities defined.' };
    }

    const lines = [
      colors.boldYellow(`Abilities (${abilities.length} total):`),
      '',
    ];

    // Group by type
    const byType = new Map<string, typeof abilities>();
    for (const ability of abilities) {
      if (!byType.has(ability.ability_type)) {
        byType.set(ability.ability_type, []);
      }
      byType.get(ability.ability_type)!.push(ability);
    }

    for (const [type, typeAbilities] of byType) {
      lines.push(colors.boldCyan(`  ${type.charAt(0).toUpperCase() + type.slice(1)}s:`));
      for (const ability of typeAbilities.slice(0, 10)) {
        const cost = ability.resource_cost ? ` (${ability.resource_cost} ${ability.resource_type || 'resource'})` : '';
        lines.push(`    ${colors.white(ability.ability_id)} - ${ability.display_name}${cost}`);
      }
      if (typeAbilities.length > 10) {
        lines.push(`    ... and ${typeAbilities.length - 10} more`);
      }
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list abilities: ${error}` };
  }
}

async function handleAbilityInfo(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @abilityinfo <ability_id>' };
  }

  try {
    const ability = await progressionRepo.getAbilityById(args[0]);
    if (!ability) {
      return { type: MessageType.ERROR, message: `Ability not found: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow('Ability Info:'),
      `  ${colors.boldCyan('ID:')} ${ability.ability_id}`,
      `  ${colors.boldCyan('Name:')} ${ability.display_name}`,
      `  ${colors.boldCyan('Type:')} ${ability.ability_type}`,
      `  ${colors.boldCyan('Description:')} ${ability.description || 'none'}`,
      `  ${colors.boldCyan('Resource Cost:')} ${ability.resource_cost || 0} ${ability.resource_type || ''}`,
      `  ${colors.boldCyan('Cooldown:')} ${ability.cooldown || 0}s`,
      `  ${colors.boldCyan('Tags:')} ${ability.emitted_tags?.join(', ') || 'none'}`,
      `  ${colors.boldCyan('Effect Data:')} ${ability.effect_data ? JSON.stringify(ability.effect_data) : 'none'}`,
    ];

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to get ability info: ${error}` };
  }
}

async function handleCreateAbility(args: string[]): Promise<CommandResponse> {
  // @createability <ability_id> <type> <display_name>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @createability <ability_id> <type> <display_name>\r\nTypes: skill, spell, technique, passive' };
  }

  const abilityId = args[0];
  const abilityType = args[1].toLowerCase();
  const displayName = args.slice(2).join(' ');

  const validTypes = ['skill', 'spell', 'technique', 'passive'];
  if (!validTypes.includes(abilityType)) {
    return { type: MessageType.ERROR, message: `Invalid type. Must be one of: ${validTypes.join(', ')}` };
  }

  try {
    const ability = await progressionRepo.createAbility({
      ability_id: abilityId,
      display_name: displayName,
      ability_type: abilityType as 'skill' | 'spell' | 'technique' | 'passive',
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Ability created:')} ${ability.display_name} (${ability.ability_id})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create ability: ${error}` };
  }
}

async function handleEditAbility(args: string[]): Promise<CommandResponse> {
  // @editability <ability_id> <field> <value>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @editability <ability_id> <field> <value>\r\nFields: name, desc, type, cost, resource, cooldown, tags' };
  }

  const abilityId = args[0];
  const field = args[1].toLowerCase();
  const value = args.slice(2).join(' ');

  try {
    let updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates = { display_name: value };
        break;
      case 'desc':
      case 'description':
        updates = { description: value };
        break;
      case 'type': {
        const validTypes = ['skill', 'spell', 'technique', 'passive'];
        if (!validTypes.includes(value.toLowerCase())) {
          return { type: MessageType.ERROR, message: `Invalid ability type. Must be one of: ${validTypes.join(', ')}` };
        }
        updates = { ability_type: value.toLowerCase() };
        break;
      }
      case 'cost': {
        const costVal = parseInt(value);
        if (isNaN(costVal)) {
          return { type: MessageType.ERROR, message: 'Invalid cost value. Must be a number.' };
        }
        updates = { resource_cost: costVal };
        break;
      }
      case 'resource':
        updates = { resource_type: value };
        break;
      case 'cooldown': {
        const cooldownVal = parseInt(value);
        if (isNaN(cooldownVal)) {
          return { type: MessageType.ERROR, message: 'Invalid cooldown value. Must be a number.' };
        }
        updates = { cooldown: cooldownVal };
        break;
      }
      case 'tags':
        updates = { emitted_tags: value.split(',').map(t => t.trim()) };
        break;
      default:
        return { type: MessageType.ERROR, message: `Unknown field: ${field}` };
    }

    const ability = await progressionRepo.updateAbility(abilityId, updates);
    if (!ability) {
      return { type: MessageType.ERROR, message: `Ability not found: ${abilityId}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Ability updated:')} ${ability.display_name}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update ability: ${error}` };
  }
}

async function handleDeleteAbility(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @deleteability <ability_id>' };
  }

  try {
    const deleted = await progressionRepo.deleteAbility(args[0]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Ability not found: ${args[0]}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Ability deleted:')} ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete ability: ${error}` };
  }
}

// ============================================================================
// TALENT COMMANDS
// ============================================================================

async function handleListTalents(args: string[]): Promise<CommandResponse> {
  try {
    const talents = args.length > 0
      ? await progressionRepo.getTalentsByClass(args[0])
      : await progressionRepo.getAllTalents();

    if (talents.length === 0) {
      return { type: MessageType.SYSTEM, message: 'No talents defined.' };
    }

    const lines = [
      colors.boldYellow(`Talents (${talents.length} total):`),
      '',
    ];

    // Group by class restriction
    const byClass = new Map<string, typeof talents>();
    for (const talent of talents) {
      const cls = talent.class_restriction || 'General';
      if (!byClass.has(cls)) {
        byClass.set(cls, []);
      }
      byClass.get(cls)!.push(talent);
    }

    for (const [cls, classTalents] of byClass) {
      lines.push(colors.boldCyan(`  ${cls}:`));
      for (const talent of classTalents.slice(0, 10)) {
        lines.push(`    ${colors.white(talent.talent_id)} - ${talent.display_name} (${talent.essence_cost} essence, Lv${talent.prerequisite_level}+)`);
      }
      if (classTalents.length > 10) {
        lines.push(`    ... and ${classTalents.length - 10} more`);
      }
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list talents: ${error}` };
  }
}

async function handleTalentInfo(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @talentinfo <talent_id>' };
  }

  try {
    const talent = await progressionRepo.getTalentById(args[0]);
    if (!talent) {
      return { type: MessageType.ERROR, message: `Talent not found: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow('Talent Info:'),
      `  ${colors.boldCyan('ID:')} ${talent.talent_id}`,
      `  ${colors.boldCyan('Name:')} ${talent.display_name}`,
      `  ${colors.boldCyan('Description:')} ${talent.description || 'none'}`,
      `  ${colors.boldCyan('Class:')} ${talent.class_restriction || 'General'}`,
      `  ${colors.boldCyan('Essence Cost:')} ${talent.essence_cost}`,
      `  ${colors.boldCyan('Required Level:')} ${talent.prerequisite_level}`,
      `  ${colors.boldCyan('Prerequisites:')} ${talent.prerequisite_talents?.join(', ') || 'none'}`,
      `  ${colors.boldCyan('Effects:')} ${talent.effect_modifiers ? JSON.stringify(talent.effect_modifiers) : 'none'}`,
      `  ${colors.boldCyan('Grants Ability:')} ${talent.grants_ability || 'none'}`,
    ];

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to get talent info: ${error}` };
  }
}

async function handleCreateTalent(args: string[]): Promise<CommandResponse> {
  // @createtalent <talent_id> <essence_cost> <display_name>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @createtalent <talent_id> <essence_cost> <display_name>' };
  }

  const talentId = args[0];
  const essenceCost = parseInt(args[1]);
  const displayName = args.slice(2).join(' ');

  if (isNaN(essenceCost)) {
    return { type: MessageType.ERROR, message: 'essence_cost must be a number' };
  }

  try {
    const talent = await progressionRepo.createTalent({
      talent_id: talentId,
      display_name: displayName,
      essence_cost: essenceCost,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Talent created:')} ${talent.display_name} (${talent.talent_id})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create talent: ${error}` };
  }
}

async function handleEditTalent(args: string[]): Promise<CommandResponse> {
  // @edittalent <talent_id> <field> <value>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @edittalent <talent_id> <field> <value>\r\nFields: name, desc, class, cost, level, prereqs, ability' };
  }

  const talentId = args[0];
  const field = args[1].toLowerCase();
  const value = args.slice(2).join(' ');

  try {
    let updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates = { display_name: value };
        break;
      case 'desc':
      case 'description':
        updates = { description: value };
        break;
      case 'class':
        updates = { class_restriction: value === 'none' ? null : value };
        break;
      case 'cost': {
        const costValue = Number(value);
        if (!Number.isInteger(costValue) || costValue < 0) {
          return { type: MessageType.ERROR, message: 'Essence cost must be a non-negative integer' };
        }
        updates = { essence_cost: costValue };
        break;
      }
      case 'level': {
        const levelValue = Number(value);
        if (!Number.isInteger(levelValue) || levelValue < 1) {
          return { type: MessageType.ERROR, message: 'Prerequisite level must be a positive integer' };
        }
        updates = { prerequisite_level: levelValue };
        break;
      }
      case 'prereqs':
        updates = { prerequisite_talents: value.split(',').map(t => t.trim()) };
        break;
      case 'ability':
        updates = { grants_ability: value === 'none' ? null : value };
        break;
      default:
        return { type: MessageType.ERROR, message: `Unknown field: ${field}` };
    }

    const talent = await progressionRepo.updateTalent(talentId, updates);
    if (!talent) {
      return { type: MessageType.ERROR, message: `Talent not found: ${talentId}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Talent updated:')} ${talent.display_name}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update talent: ${error}` };
  }
}

async function handleDeleteTalent(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @deletetalent <talent_id>' };
  }

  try {
    const deleted = await progressionRepo.deleteTalent(args[0]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Talent not found: ${args[0]}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Talent deleted:')} ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete talent: ${error}` };
  }
}

// ============================================================================
// EVENT COMMANDS
// ============================================================================

async function handleListEvents(): Promise<CommandResponse> {
  try {
    const events = await progressionRepo.getAllGameEvents();

    if (events.length === 0) {
      return { type: MessageType.SYSTEM, message: 'No game events defined.' };
    }

    const lines = [
      colors.boldYellow(`Game Events (${events.length} total):`),
      '',
    ];

    for (const event of events) {
      const tags = event.emitted_tags.join(', ') || 'none';
      lines.push(`  ${colors.boldCyan(event.event_id)} - ${event.display_name || event.event_id} (${event.base_essence_value} ess, ${event.base_xp_value || 0} xp) [${tags}]`);
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list events: ${error}` };
  }
}

async function handleEventInfo(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @eventinfo <event_id>' };
  }

  try {
    const event = await progressionRepo.getGameEventById(args[0]);
    if (!event) {
      return { type: MessageType.ERROR, message: `Event not found: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow('Game Event Info:'),
      `  ${colors.boldCyan('ID:')} ${event.event_id}`,
      `  ${colors.boldCyan('Name:')} ${event.display_name || event.event_id}`,
      `  ${colors.boldCyan('Base Essence:')} ${event.base_essence_value}`,
      `  ${colors.boldCyan('Base XP:')} ${event.base_xp_value || 0}`,
      `  ${colors.boldCyan('Tags:')} ${event.emitted_tags.join(', ') || 'none'}`,
    ];

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to get event info: ${error}` };
  }
}

async function handleCreateEvent(args: string[]): Promise<CommandResponse> {
  // @createevent <event_id> <base_essence> <tags...>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @createevent <event_id> <base_essence> <tags...>' };
  }

  const eventId = args[0];
  const baseEssence = parseInt(args[1]);
  const tags = args.slice(2);

  if (isNaN(baseEssence)) {
    return { type: MessageType.ERROR, message: 'base_essence must be a number' };
  }

  try {
    const event = await progressionRepo.createGameEvent({
      event_id: eventId,
      base_essence_value: baseEssence,
      emitted_tags: tags,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Event created:')} ${event.event_id} (${event.base_essence_value} essence)`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create event: ${error}` };
  }
}

async function handleEditEvent(args: string[]): Promise<CommandResponse> {
  // @editevent <event_id> <field> <value>
  if (args.length < 3) {
    return { type: MessageType.ERROR, message: 'Usage: @editevent <event_id> <field> <value>\r\nFields: name, essence, xp, tags' };
  }

  const eventId = args[0];
  const field = args[1].toLowerCase();
  const value = args.slice(2).join(' ');

  try {
    let updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates = { display_name: value };
        break;
      case 'essence': {
        const essenceValue = Number(value);
        if (!Number.isInteger(essenceValue) || essenceValue < 0) {
          return { type: MessageType.ERROR, message: 'Essence value must be a non-negative integer' };
        }
        updates = { base_essence_value: essenceValue };
        break;
      }
      case 'xp': {
        const xpValue = Number(value);
        if (!Number.isInteger(xpValue) || xpValue < 0) {
          return { type: MessageType.ERROR, message: 'XP value must be a non-negative integer' };
        }
        updates = { base_xp_value: xpValue };
        break;
      }
      case 'tags':
        updates = { emitted_tags: value.split(',').map(t => t.trim()) };
        break;
      default:
        return { type: MessageType.ERROR, message: `Unknown field: ${field}` };
    }

    const event = await progressionRepo.updateGameEvent(eventId, updates);
    if (!event) {
      return { type: MessageType.ERROR, message: `Event not found: ${eventId}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Event updated:')} ${event.event_id}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update event: ${error}` };
  }
}

async function handleDeleteEvent(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @deleteevent <event_id>' };
  }

  try {
    const deleted = await progressionRepo.deleteGameEvent(args[0]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Event not found: ${args[0]}` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Event deleted:')} ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete event: ${error}` };
  }
}

// ============================================================================
// CLASS ABILITY MAPPING COMMANDS
// ============================================================================

async function handleListClassAbilities(args: string[]): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @classabilities <class_id>' };
  }

  try {
    const abilities = await progressionRepo.getClassAbilities(args[0]);

    if (abilities.length === 0) {
      return { type: MessageType.SYSTEM, message: `No abilities assigned to class: ${args[0]}` };
    }

    const lines = [
      colors.boldYellow(`Abilities for ${args[0]} (${abilities.length} total):`),
      '',
    ];

    for (const mapping of abilities) {
      const autoLearn = mapping.auto_learn ? ' [auto]' : '';
      const cost = mapping.training_cost ? ` (${mapping.training_cost} gold)` : '';
      lines.push(`  Lv${mapping.required_level}: ${colors.boldCyan(mapping.ability_id)}${autoLearn}${cost}`);
    }

    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to list class abilities: ${error}` };
  }
}

async function handleAddClassAbility(args: string[]): Promise<CommandResponse> {
  // @addclassability <class_id> <ability_id> [level] [auto]
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @addclassability <class_id> <ability_id> [level] [auto]' };
  }

  const classId = args[0];
  const abilityId = args[1];
  const level = args.length > 2 ? parseInt(args[2]) : 1;
  const autoLearn = args.includes('auto');

  try {
    const mapping = await progressionRepo.addClassAbility({
      class_id: classId,
      ability_id: abilityId,
      required_level: isNaN(level) ? 1 : level,
      auto_learn: autoLearn,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Class ability added:')} ${mapping.ability_id} to ${mapping.class_id} at level ${mapping.required_level}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to add class ability: ${error}` };
  }
}

async function handleRemoveClassAbility(args: string[]): Promise<CommandResponse> {
  // @removeclassability <class_id> <ability_id>
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @removeclassability <class_id> <ability_id>' };
  }

  try {
    const deleted = await progressionRepo.removeClassAbility(args[0], args[1]);
    if (!deleted) {
      return { type: MessageType.ERROR, message: `Class ability mapping not found` };
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Class ability removed:')} ${args[1]} from ${args[0]}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to remove class ability: ${error}` };
  }
}

// ============================================================================
// HELP
// ============================================================================

export function getProgressionHelpText(): string {
  const lines = [
    '',
    colors.boldYellow('Developer Commands (Progression):'),
    `  ${colors.boldCyan('@classes')}                    - List all classes`,
    `  ${colors.boldCyan('@classinfo <id>')}             - Show class details`,
    `  ${colors.boldCyan('@createclass <id> <name>')}    - Create a class`,
    `  ${colors.boldCyan('@editclass <id> <field> <val>')} - Edit a class`,
    `  ${colors.boldCyan('@deleteclass <id>')}           - Delete a class`,
    '',
    `  ${colors.boldCyan('@races')}                      - List all races`,
    `  ${colors.boldCyan('@raceinfo <id>')}              - Show race details`,
    `  ${colors.boldCyan('@createrace <id> <name>')}     - Create a race`,
    `  ${colors.boldCyan('@editrace <id> <field> <val>')} - Edit a race`,
    `  ${colors.boldCyan('@deleterace <id>')}            - Delete a race`,
    '',
    `  ${colors.boldCyan('@abilities [type]')}           - List abilities`,
    `  ${colors.boldCyan('@abilityinfo <id>')}           - Show ability details`,
    `  ${colors.boldCyan('@createability <id> <type> <name>')} - Create ability`,
    `  ${colors.boldCyan('@editability <id> <field> <val>')} - Edit ability`,
    `  ${colors.boldCyan('@deleteability <id>')}         - Delete ability`,
    '',
    `  ${colors.boldCyan('@talents [class]')}            - List talents`,
    `  ${colors.boldCyan('@talentinfo <id>')}            - Show talent details`,
    `  ${colors.boldCyan('@createtalent <id> <cost> <name>')} - Create talent`,
    `  ${colors.boldCyan('@edittalent <id> <field> <val>')} - Edit talent`,
    `  ${colors.boldCyan('@deletetalent <id>')}          - Delete talent`,
    '',
    `  ${colors.boldCyan('@events')}                     - List essence events`,
    `  ${colors.boldCyan('@eventinfo <id>')}             - Show event details`,
    `  ${colors.boldCyan('@createevent <id> <ess> <tags>')} - Create event`,
    `  ${colors.boldCyan('@editevent <id> <field> <val>')} - Edit event`,
    `  ${colors.boldCyan('@deleteevent <id>')}           - Delete event`,
    '',
    `  ${colors.boldCyan('@classabilities <class>')}     - List class abilities`,
    `  ${colors.boldCyan('@addclassability <cls> <abl> [lv] [auto]')} - Add ability to class`,
    `  ${colors.boldCyan('@removeclassability <cls> <abl>')} - Remove ability from class`,
  ];

  return lines.join('\r\n');
}
