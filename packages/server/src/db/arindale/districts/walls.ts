/**
 * City Gates, Walls, and Castle Approach — 12 rooms.
 * 3 gates (closed), 4 guard towers (up/down only), castle road.
 */
import { DistrictData } from '../types.js';

export function getWallsDistrict(): DistrictData {
  return {
    rooms: [
      // ── Gates ──────────────────────────────────────────────────────────

      {
        tag: 'gate_east',
        name: 'East Gate',
        description: `The massive iron-bound gates of Arindale stand beneath a stone archway carved with the city's crest. Guards in polished mail watch the road. The gates are closed, the heavy portcullis lowered. Beyond the bars, the road stretches east into open countryside.`,
      },
      {
        tag: 'gate_west',
        name: 'West Gate',
        description: `Thick oak doors banded with iron seal the western entrance to the city. Arrow slits in the flanking towers watch the road outside. The gates are shut tight, and no traffic passes through. A guard leans against the wall, looking bored.`,
      },
      {
        tag: 'gate_south',
        name: 'South Gate',
        description: `The southern gate is smaller than its counterparts but no less sturdy. Twin guard towers bracket the closed doors. Through the iron grating, the southern road disappears into rolling farmland. A posted notice reads: "Gate closed by order of the city council."`,
      },

      // ── Guard Towers (corner towers, up/down only) ──────────────────────

      {
        tag: 'wall_south_tower_e',
        name: 'Southeast Guard Tower',
        description: `A square stone tower at the corner of the city wall, its top offering a sweeping view south and east. A brazier for signal fires stands ready, and a rack holds crossbows and bolts. Stairs lead down to the street below.`,
      },
      {
        tag: 'wall_south_tower_w',
        name: 'Southwest Guard Tower',
        description: `This corner tower commands views south and west. A spiral stair connects to the street below. A watchman's logbook lies open on a stone ledge, its pages fluttering in the breeze.`,
      },
      {
        tag: 'wall_west_tower_n',
        name: 'Northwest Guard Tower',
        description: `The northwestern tower overlooks the harbor and the open sea beyond. The salt wind is strong up here, and the calls of gulls mingle with the snap of the tower's pennant. Stairs descend to the street.`,
      },
      {
        tag: 'wall_east_tower_n',
        name: 'Northeast Guard Tower',
        description: `The northeastern tower stands where the city wall meets the harbor defenses. The view north shows the docks and the harbor mouth. A signal horn hangs from a hook, ready to raise the alarm.`,
      },

      // ── Castle Road (north of Harbor Road) ─────────────────────────────

      {
        tag: 'castle_road_1',
        name: 'Castle Road',
        description: `A broad avenue paved in pale stone leads north from the harbor toward the castle, flanked by tall banners bearing the royal standard. The road rises gradually, offering a view of the harbor below.`,
        terrain: 'road',
      },
      {
        tag: 'castle_road_2',
        name: 'Castle Road',
        description: `Statues of past kings stand on plinths along both sides of the road, their stone faces staring sternly ahead. The royal banners snap in the wind. The castle walls grow larger with each step north.`,
        terrain: 'road',
      },
      {
        tag: 'castle_road_3',
        name: 'Castle Road',
        description: `The avenue widens into a small forecourt before the castle's outer wall. Guard checkpoints flank the road, though the guards wave travelers through without challenge. The castle gatehouse looms ahead.`,
        terrain: 'road',
      },
      {
        tag: 'castle_road_4',
        name: 'Castle Road',
        description: `The road ends at the foot of the castle's outer gatehouse. Massive towers bracket a stone bridge that crosses a dry moat. The castle's banners fly high above, and the sound of trumpets occasionally drifts from within.`,
        terrain: 'road',
      },
      {
        tag: 'castle_drawbridge',
        name: 'Castle Drawbridge',
        description: `The drawbridge is raised, its heavy chains taut against the gatehouse winches. The gap between the road and the castle gate is too wide to cross. Across the moat, the castle's iron portcullis is lowered. A sign reads: "The castle is closed to visitors by royal decree."`,
        terrain: 'road',
      },
    ],

    exits: [
      // ── Gate connections ────────────────────────────────────────────────

      // East Gate — from east end of Main Street (int_2_4)
      { fromTag: 'int_2_4', toTag: 'gate_east', direction: 'east' },
      { fromTag: 'gate_east', toTag: 'int_2_4', direction: 'west' },

      // West Gate — from west end of Main Street (int_2_0)
      { fromTag: 'int_2_0', toTag: 'gate_west', direction: 'west' },
      { fromTag: 'gate_west', toTag: 'int_2_0', direction: 'east' },

      // South Gate — south of the Southwall/King's Road intersection
      { fromTag: 'int_4_2', toTag: 'gate_south', direction: 'south' },
      { fromTag: 'gate_south', toTag: 'int_4_2', direction: 'north' },

      // ── Guard Towers (up/down only) ────────────────────────────────────

      // SE tower — from Eastwall/Southwall intersection
      { fromTag: 'int_4_4', toTag: 'wall_south_tower_e', direction: 'up' },
      { fromTag: 'wall_south_tower_e', toTag: 'int_4_4', direction: 'down' },

      // SW tower — from Westwall/Southwall intersection
      { fromTag: 'int_4_0', toTag: 'wall_south_tower_w', direction: 'up' },
      { fromTag: 'wall_south_tower_w', toTag: 'int_4_0', direction: 'down' },

      // NW tower — from Westwall/Harbor intersection
      { fromTag: 'int_0_0', toTag: 'wall_west_tower_n', direction: 'up' },
      { fromTag: 'wall_west_tower_n', toTag: 'int_0_0', direction: 'down' },

      // NE tower — from Eastwall/Harbor intersection
      { fromTag: 'int_0_4', toTag: 'wall_east_tower_n', direction: 'up' },
      { fromTag: 'wall_east_tower_n', toTag: 'int_0_4', direction: 'down' },

      // ── Castle Road ────────────────────────────────────────────────────

      // Start from Harbor Road / King's Road intersection heading north
      { fromTag: 'int_0_2', toTag: 'castle_road_1', direction: 'north' },
      { fromTag: 'castle_road_1', toTag: 'int_0_2', direction: 'south' },
      { fromTag: 'castle_road_1', toTag: 'castle_road_2', direction: 'north' },
      { fromTag: 'castle_road_2', toTag: 'castle_road_1', direction: 'south' },
      { fromTag: 'castle_road_2', toTag: 'castle_road_3', direction: 'north' },
      { fromTag: 'castle_road_3', toTag: 'castle_road_2', direction: 'south' },
      { fromTag: 'castle_road_3', toTag: 'castle_road_4', direction: 'north' },
      { fromTag: 'castle_road_4', toTag: 'castle_road_3', direction: 'south' },
      { fromTag: 'castle_road_4', toTag: 'castle_drawbridge', direction: 'north' },
      { fromTag: 'castle_drawbridge', toTag: 'castle_road_4', direction: 'south' },
    ],

    doors: [
      // 3 city gates — physical, closed, unbashable
      {
        name: 'east gate',
        doorType: 'physical',
        entryTag: 'int_2_4',
        entryDirection: 'east',
        exitTag: 'gate_east',
        exitDirection: 'west',
        defaultState: 'closed',
        autoResetSeconds: 0,
        hasLock: false,
        bashDifficulty: 9999,
        denialMessage: 'The massive gates are sealed shut. They cannot be opened from this side.',
      },
      {
        name: 'west gate',
        doorType: 'physical',
        entryTag: 'int_2_0',
        entryDirection: 'west',
        exitTag: 'gate_west',
        exitDirection: 'east',
        defaultState: 'closed',
        autoResetSeconds: 0,
        hasLock: false,
        bashDifficulty: 9999,
        denialMessage: 'The heavy oak doors are barred from within. They will not budge.',
      },
      {
        name: 'south gate',
        doorType: 'physical',
        entryTag: 'int_4_2',
        entryDirection: 'south',
        exitTag: 'gate_south',
        exitDirection: 'north',
        defaultState: 'closed',
        autoResetSeconds: 0,
        hasLock: false,
        bashDifficulty: 9999,
        denialMessage: 'The southern gates are closed by order of the city council.',
      },
    ],
  };
}
