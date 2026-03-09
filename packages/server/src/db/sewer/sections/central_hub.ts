/**
 * Central Hub — 10 rooms.
 * Town Square manhole (C, int_2_2) lands here.
 * Safest area, some light from grates above, main junction.
 * Level 3 mobs.
 */
import { DistrictData } from '../../arindale/types.js';
import { sewerDescription, maybeAddSewerDetail } from '../descriptions.js';

function desc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('central', tag), tag);
}

export function getCentralHub(): DistrictData {
  return {
    rooms: [
      {
        tag: 'sewer_central_hub',
        name: 'Sewer Junction',
        description: `A large vaulted chamber where four major tunnels converge. Faint grey light filters down through a heavy iron grate far above — the town square, by the sound of cart wheels and voices overhead. The stonework is solid and well-maintained this close to the surface. Water channels run along the floor in all four directions, their flow steady and purposeful.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_1',
        name: 'Central Passage',
        description: desc('sewer_central_1'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_2',
        name: 'Sewer Tunnel',
        description: desc('sewer_central_2'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_3',
        name: 'Sewer Passage',
        description: desc('sewer_central_3'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_4',
        name: 'Main Tunnel',
        description: desc('sewer_central_4'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_5',
        name: 'Central Passage',
        description: desc('sewer_central_5'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_6',
        name: 'Sewer Tunnel',
        description: desc('sewer_central_6'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_7',
        name: 'Sewer Passage',
        description: desc('sewer_central_7'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_8',
        name: 'Main Tunnel',
        description: desc('sewer_central_8'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_central_9',
        name: 'Central Passage',
        description: desc('sewer_central_9'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
    ],

    exits: [
      { fromTag: 'sewer_central_hub', toTag: 'int_2_2', direction: 'up' },
      { fromTag: 'int_2_2', toTag: 'sewer_central_hub', direction: 'down' },
      { fromTag: 'sewer_central_7', toTag: 'sewer_central_8', direction: 'east' },
      { fromTag: 'sewer_central_8', toTag: 'sewer_central_7', direction: 'west' },
      { fromTag: 'sewer_central_hub', toTag: 'sewer_central_2', direction: 'south' },
      { fromTag: 'sewer_central_2', toTag: 'sewer_central_hub', direction: 'north' },
      { fromTag: 'sewer_central_1', toTag: 'sewer_central_4', direction: 'south' },
      { fromTag: 'sewer_central_4', toTag: 'sewer_central_1', direction: 'north' },
      { fromTag: 'sewer_central_2', toTag: 'sewer_central_5', direction: 'south' },
      { fromTag: 'sewer_central_5', toTag: 'sewer_central_2', direction: 'north' },
      { fromTag: 'sewer_central_3', toTag: 'sewer_central_6', direction: 'south' },
      { fromTag: 'sewer_central_6', toTag: 'sewer_central_3', direction: 'north' },
      { fromTag: 'sewer_central_5', toTag: 'sewer_central_8', direction: 'south' },
      { fromTag: 'sewer_central_8', toTag: 'sewer_central_5', direction: 'north' },
      { fromTag: 'sewer_central_6', toTag: 'sewer_central_9', direction: 'south' },
      { fromTag: 'sewer_central_9', toTag: 'sewer_central_6', direction: 'north' },
    ],

    doors: [
      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_2_2',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      }
    ],
  };
}
