/**
 * West Tunnels — 13 rooms.
 * Market manhole (M, int_2_1) lands at sewer_west_hub.
 * Older brick construction, alchemical residue, strange stains.
 * Iridescent Menagerie entrance (I) behind a false wall.
 * Level 3-5 mobs.
 */
import { DistrictData } from '../../arindale/types.js';
import { sewerDescription, maybeAddSewerDetail } from '../descriptions.js';

function desc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('west', tag), tag);
}

export function getWestTunnels(): DistrictData {
  return {
    rooms: [
      {
        tag: 'sewer_west_hub',
        name: 'Sewer Tunnel',
        description: `A wide tunnel beneath the market district. Faint light seeps down through a heavy iron manhole cover far above. The air carries an acrid chemical tang — runoff from the alchemist's and dyer's shops on the street above. The brickwork here is older than elsewhere in the sewer, patched and repatched over the years.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_junction',
        name: 'Western Junction',
        description: `A junction chamber where older brick tunnels meet the main sewer line. The walls change character here — the standardized construction of the main passages giving way to rougher, older brickwork to the west. Chemical stains streak the stones in iridescent patterns.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_1',
        name: 'Old Passage',
        description: desc('sewer_west_1'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_2',
        name: 'Stained Tunnel',
        description: desc('sewer_west_2'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_3',
        name: 'Alchemical Tunnel',
        description: desc('sewer_west_3'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_entrance_menagerie',
        name: 'Iridescent Passage',
        description: `The tunnel wall here is streaked with brilliant iridescent stains that seem to pulse with a faint inner light. The air smells of chemicals and something else — something alive and strange. A section of the wall is subtly different from the surrounding brickwork, its mortar lines not quite matching. Behind it, a faint greenish glow leaks through hairline cracks.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_4',
        name: 'Crumbling Tunnel',
        description: desc('sewer_west_4'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_5',
        name: 'Chemical Passage',
        description: desc('sewer_west_5'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_6',
        name: 'Stained Passage',
        description: desc('sewer_west_6'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_7',
        name: 'Old Brick Tunnel',
        description: desc('sewer_west_7'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_8',
        name: 'Old Passage',
        description: desc('sewer_west_8'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_9',
        name: 'Stained Tunnel',
        description: desc('sewer_west_9'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'sewer_west_10',
        name: 'Stained Passage',
        description: desc('sewer_west_10'),
        area: 'Arindale Sewer',
        terrain: 'underground',
        darkness_level: -120,
      },
    ],

    exits: [
      { fromTag: 'sewer_west_hub', toTag: 'int_2_1', direction: 'up' },
      { fromTag: 'int_2_1', toTag: 'sewer_west_hub', direction: 'down' },
      { fromTag: 'sewer_west_hub', toTag: 'sewer_west_junction', direction: 'east' },
      { fromTag: 'sewer_west_junction', toTag: 'sewer_west_hub', direction: 'west' },
      { fromTag: 'sewer_entrance_menagerie', toTag: 'sewer_west_4', direction: 'east' },
      { fromTag: 'sewer_west_4', toTag: 'sewer_entrance_menagerie', direction: 'west' },
      { fromTag: 'sewer_west_8', toTag: 'sewer_west_9', direction: 'east' },
      { fromTag: 'sewer_west_9', toTag: 'sewer_west_8', direction: 'west' },
      { fromTag: 'sewer_west_hub', toTag: 'sewer_west_1', direction: 'south' },
      { fromTag: 'sewer_west_1', toTag: 'sewer_west_hub', direction: 'north' },
      { fromTag: 'sewer_west_junction', toTag: 'sewer_west_2', direction: 'south' },
      { fromTag: 'sewer_west_2', toTag: 'sewer_west_junction', direction: 'north' },
      { fromTag: 'sewer_west_1', toTag: 'sewer_west_4', direction: 'south' },
      { fromTag: 'sewer_west_4', toTag: 'sewer_west_1', direction: 'north' },
      { fromTag: 'sewer_west_2', toTag: 'sewer_west_5', direction: 'south' },
      { fromTag: 'sewer_west_5', toTag: 'sewer_west_2', direction: 'north' },
      { fromTag: 'sewer_west_3', toTag: 'sewer_west_6', direction: 'south' },
      { fromTag: 'sewer_west_6', toTag: 'sewer_west_3', direction: 'north' },
      { fromTag: 'sewer_west_4', toTag: 'sewer_west_7', direction: 'south' },
      { fromTag: 'sewer_west_7', toTag: 'sewer_west_4', direction: 'north' },
      { fromTag: 'sewer_west_6', toTag: 'sewer_west_9', direction: 'south' },
      { fromTag: 'sewer_west_9', toTag: 'sewer_west_6', direction: 'north' },
      { fromTag: 'sewer_west_8', toTag: 'sewer_west_10', direction: 'south' },
      { fromTag: 'sewer_west_10', toTag: 'sewer_west_8', direction: 'north' },
    ],

    doors: [
      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_2_1',
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
