// ============================================================================
// PROGRESSION ADMIN COMMANDS
// @class, @race commands
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
      `  ${colors.boldCyan('Combat Level:')} ${cls.combat_level ?? 1}`,
      `  ${colors.boldCyan('Magic Level:')} ${cls.magic_level ?? 0}${cls.magic_school ? ` (${cls.magic_school})` : ''}`,
      `  ${colors.boldCyan('Stealth:')} ${cls.stealth ? 'Yes' : 'No'}`,
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
      `  ${colors.boldCyan('Traits:')} ${race.traits?.length ? race.traits.map((t) => typeof t === 'string' ? t : `${t.id}=${t.value}`).join(', ') : 'none'}`,
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
  ];

  return lines.join('\r\n');
}
