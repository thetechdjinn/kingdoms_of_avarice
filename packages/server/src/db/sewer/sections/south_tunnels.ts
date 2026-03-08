/**
 * South Tunnels — 27 rooms.
 * Southwall manhole (O, int_4_2) lands at sewer_south_hub.
 * Deepest, darkest section. Level 5-6 mobs.
 * Blockage Section (B) — quest area.
 * Thieves Guild entrance (T) — cleaner tunnels near the conduit.
 * Dead End (E) — bottom-east terminus.
 * East Road Exit (Y) — future evil escape route, dead end for now.
 */
import { DistrictData } from '../../arindale/types.js';
import { sewerDescription, maybeAddSewerDetail } from '../descriptions.js';

function desc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('south', tag), tag);
}

function blDesc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('blockage', tag), tag);
}

function tgDesc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('tg_approach', tag), tag);
}
export function getSouthTunnels(): DistrictData {
  return {
    rooms: [
      {
        tag: 'sewer_south_1',
        name: 'Deep Passage',
        description: desc('sewer_south_1'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_2',
        name: 'Abandoned Tunnel',
        description: desc('sewer_south_2'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_3',
        name: 'Forgotten Passage',
        description: desc('sewer_south_3'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_4',
        name: 'Dark Passage',
        description: desc('sewer_south_4'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_5',
        name: 'Deep Tunnel',
        description: desc('sewer_south_5'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_6',
        name: 'Narrow Tunnel',
        description: desc('sewer_south_6'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_7',
        name: 'Deep Passage',
        description: desc('sewer_south_7'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_hub',
        name: 'Deep Sewer Junction',
        description: `The tunnels descend into a deep junction where the last traces of surface light have long since vanished. A manhole shaft reaches up into impenetrable darkness above — the Southwall Road, impossibly far overhead. The air is cold and dead. Multiple tunnels branch off into the blackness, each one deeper and more forbidding than the last.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_blockage_1',
        name: 'Obstructed Tunnel',
        description: `The tunnel is partially blocked by a mass of debris — broken masonry, rotting timbers, and accumulated filth compressed into a solid wall. Water backs up behind the obstruction, creating a shallow, stagnant pool that stretches back down the passage. The blockage looks old but solid, and the air behind it reeks of stagnation.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_8',
        name: 'Abandoned Tunnel',
        description: desc('sewer_south_8'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_east_road_exit',
        name: 'Blocked Drainage Pipe',
        description: `The tunnel widens into a low-ceilinged chamber where a large drainage pipe passes through the city's eastern foundation wall. The pipe is partially blocked by accumulated debris and rust, but faint daylight filters in from beyond. The distant sounds of the East Road — cart wheels on cobblestones, the shuffle of travelers — echo faintly through the obstruction. The pipe could potentially be cleared, but for now it remains impassable.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_9',
        name: 'Forgotten Passage',
        description: desc('sewer_south_9'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_10',
        name: 'Deep Tunnel',
        description: desc('sewer_south_10'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_11',
        name: 'Dark Passage',
        description: desc('sewer_south_11'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_12',
        name: 'Forgotten Passage',
        description: desc('sewer_south_12'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_south_13',
        name: 'Abandoned Tunnel',
        description: desc('sewer_south_13'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_1',
        name: 'Abandoned Tunnel',
        description: tgDesc('sewer_tg_approach_1'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_2',
        name: 'Forgotten Passage',
        description: tgDesc('sewer_tg_approach_2'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_3',
        name: 'Dark Passage',
        description: tgDesc('sewer_tg_approach_3'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_4',
        name: 'Deep Tunnel',
        description: tgDesc('sewer_tg_approach_4'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_5',
        name: 'Narrow Tunnel',
        description: tgDesc('sewer_tg_approach_5'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_6',
        name: 'Deep Passage',
        description: tgDesc('sewer_tg_approach_6'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_7',
        name: 'Abandoned Tunnel',
        description: tgDesc('sewer_tg_approach_7'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_8',
        name: 'Forgotten Passage',
        description: tgDesc('sewer_tg_approach_8'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_tg_approach_9',
        name: 'Dark Passage',
        description: tgDesc('sewer_tg_approach_9'),
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_entrance_tg',
        name: 'Broken Conduit Chamber',
        description: `The tunnel opens into a wider chamber where a massive water conduit, cracked and broken, lies partially embedded in the floor. The pipe is wide enough for a person to enter, and its interior descends at a steep angle into darkness below the sewer level. The chamber itself is clean — swept, maintained, clearly in regular use. Torch sconces line the walls, recently used. Bootprints in the grime lead directly to the conduit's mouth.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
      {
        tag: 'sewer_dead_end',
        name: 'Dead End',
        description: `The tunnel simply ends here in a wall of rough stone and packed earth. The construction is crude, as if the tunnelers stopped abruptly or the passage was deliberately sealed long ago. Faint scratching sounds come from behind the wall, and the stone feels oddly warm to the touch. Whatever lies beyond was not meant to be reached from this direction.`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      },
    ],

    exits: [
      { fromTag: 'sewer_south_hub', toTag: 'int_4_2', direction: 'up' },
      { fromTag: 'int_4_2', toTag: 'sewer_south_hub', direction: 'down' },
      { fromTag: 'sewer_south_1', toTag: 'sewer_south_2', direction: 'east' },
      { fromTag: 'sewer_south_2', toTag: 'sewer_south_1', direction: 'west' },
      { fromTag: 'sewer_south_3', toTag: 'sewer_south_4', direction: 'east' },
      { fromTag: 'sewer_south_4', toTag: 'sewer_south_3', direction: 'west' },
      { fromTag: 'sewer_south_4', toTag: 'sewer_south_5', direction: 'east' },
      { fromTag: 'sewer_south_5', toTag: 'sewer_south_4', direction: 'west' },
      { fromTag: 'sewer_south_6', toTag: 'sewer_south_7', direction: 'east' },
      { fromTag: 'sewer_south_7', toTag: 'sewer_south_6', direction: 'west' },
      { fromTag: 'sewer_south_7', toTag: 'sewer_south_hub', direction: 'east' },
      { fromTag: 'sewer_south_hub', toTag: 'sewer_south_7', direction: 'west' },
      { fromTag: 'sewer_blockage_1', toTag: 'sewer_south_8', direction: 'east' },
      { fromTag: 'sewer_south_8', toTag: 'sewer_blockage_1', direction: 'west' },
      { fromTag: 'sewer_south_10', toTag: 'sewer_south_11', direction: 'east' },
      { fromTag: 'sewer_south_11', toTag: 'sewer_south_10', direction: 'west' },
      { fromTag: 'sewer_tg_approach_1', toTag: 'sewer_tg_approach_2', direction: 'east' },
      { fromTag: 'sewer_tg_approach_2', toTag: 'sewer_tg_approach_1', direction: 'west' },
      { fromTag: 'sewer_tg_approach_3', toTag: 'sewer_tg_approach_4', direction: 'east' },
      { fromTag: 'sewer_tg_approach_4', toTag: 'sewer_tg_approach_3', direction: 'west' },
      { fromTag: 'sewer_tg_approach_6', toTag: 'sewer_tg_approach_7', direction: 'east' },
      { fromTag: 'sewer_tg_approach_7', toTag: 'sewer_tg_approach_6', direction: 'west' },
      { fromTag: 'sewer_tg_approach_8', toTag: 'sewer_tg_approach_9', direction: 'east' },
      { fromTag: 'sewer_tg_approach_9', toTag: 'sewer_tg_approach_8', direction: 'west' },
      { fromTag: 'sewer_south_1', toTag: 'sewer_south_6', direction: 'south' },
      { fromTag: 'sewer_south_6', toTag: 'sewer_south_1', direction: 'north' },
      { fromTag: 'sewer_south_3', toTag: 'sewer_south_hub', direction: 'south' },
      { fromTag: 'sewer_south_hub', toTag: 'sewer_south_3', direction: 'north' },
      { fromTag: 'sewer_south_5', toTag: 'sewer_south_8', direction: 'south' },
      { fromTag: 'sewer_south_8', toTag: 'sewer_south_5', direction: 'north' },
      { fromTag: 'sewer_south_6', toTag: 'sewer_south_9', direction: 'south' },
      { fromTag: 'sewer_south_9', toTag: 'sewer_south_6', direction: 'north' },
      { fromTag: 'sewer_south_7', toTag: 'sewer_south_10', direction: 'south' },
      { fromTag: 'sewer_south_10', toTag: 'sewer_south_7', direction: 'north' },
      { fromTag: 'sewer_blockage_1', toTag: 'sewer_south_12', direction: 'south' },
      { fromTag: 'sewer_south_12', toTag: 'sewer_blockage_1', direction: 'north' },
      { fromTag: 'sewer_south_8', toTag: 'sewer_south_13', direction: 'south' },
      { fromTag: 'sewer_south_13', toTag: 'sewer_south_8', direction: 'north' },
      { fromTag: 'sewer_south_9', toTag: 'sewer_tg_approach_1', direction: 'south' },
      { fromTag: 'sewer_tg_approach_1', toTag: 'sewer_south_9', direction: 'north' },
      { fromTag: 'sewer_south_11', toTag: 'sewer_tg_approach_3', direction: 'south' },
      { fromTag: 'sewer_tg_approach_3', toTag: 'sewer_south_11', direction: 'north' },
      { fromTag: 'sewer_south_12', toTag: 'sewer_tg_approach_4', direction: 'south' },
      { fromTag: 'sewer_tg_approach_4', toTag: 'sewer_south_12', direction: 'north' },
      { fromTag: 'sewer_south_13', toTag: 'sewer_tg_approach_5', direction: 'south' },
      { fromTag: 'sewer_tg_approach_5', toTag: 'sewer_south_13', direction: 'north' },
      { fromTag: 'sewer_tg_approach_2', toTag: 'sewer_tg_approach_6', direction: 'south' },
      { fromTag: 'sewer_tg_approach_6', toTag: 'sewer_tg_approach_2', direction: 'north' },
      { fromTag: 'sewer_tg_approach_5', toTag: 'sewer_tg_approach_9', direction: 'south' },
      { fromTag: 'sewer_tg_approach_9', toTag: 'sewer_tg_approach_5', direction: 'north' },
      { fromTag: 'sewer_tg_approach_7', toTag: 'sewer_entrance_tg', direction: 'south' },
      { fromTag: 'sewer_entrance_tg', toTag: 'sewer_tg_approach_7', direction: 'north' },
      { fromTag: 'sewer_tg_approach_8', toTag: 'sewer_dead_end', direction: 'south' },
      { fromTag: 'sewer_dead_end', toTag: 'sewer_tg_approach_8', direction: 'north' },
    ],

    doors: [
      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_4_2',
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
