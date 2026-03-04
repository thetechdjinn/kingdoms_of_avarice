/**
 * City Gates, Walls, and Castle Approach — 18 rooms.
 * 3 gates (closed), wall walk segments, guard towers, castle road.
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

      // ── Wall Walk — Southern Wall (east to west) ───────────────────────

      {
        tag: 'wall_south_tower_e',
        name: 'Southeast Guard Tower',
        description: `A square stone tower at the corner of the city wall, its top offering a sweeping view south and east. A brazier for signal fires stands ready, and a rack holds crossbows and bolts. Stairs lead down to the street.`,
      },
      {
        tag: 'wall_south_walk_1',
        name: 'Southern Wall Walk',
        description: `The stone walkway atop the city wall offers a broad view south across rolling farmland fading into haze. A crenellated parapet lines the outer edge while the city's rooftops spread below to the north.`,
      },
      {
        tag: 'wall_south_walk_2',
        name: 'Southern Wall Walk',
        description: `Wind sweeps along the top of the southern wall. The view stretches unbroken to the horizon, where dark forests mark the edge of settled lands. A guard post with a small shelter sits against the inner parapet.`,
      },
      {
        tag: 'wall_south_tower_w',
        name: 'Southwest Guard Tower',
        description: `This corner tower commands views south and west. A spiral stair connects to the street below. A watchman's logbook lies open on a stone ledge, its pages fluttering in the breeze.`,
      },

      // ── Wall Walk — Western Wall (south to north) ──────────────────────

      {
        tag: 'wall_west_walk_1',
        name: 'Western Wall Walk',
        description: `The walkway along the western wall looks out over fields and scattered farmsteads. The afternoon sun warms the stone underfoot. A flight of startled doves bursts from a gap in the parapet.`,
      },
      {
        tag: 'wall_west_walk_2',
        name: 'Western Wall Walk',
        description: `The wall walk continues north, offering glimpses of the countryside through the crenellations. A sentry paces the walkway, his shadow stretching long across the stones.`,
      },
      {
        tag: 'wall_west_tower_n',
        name: 'Northwest Guard Tower',
        description: `The northwestern tower overlooks the harbor and the open sea beyond. The salt wind is strong up here, and the calls of gulls mingle with the snap of the tower's pennant. Stairs descend to the street.`,
      },

      // ── Wall Walk — Eastern Wall (south to north) ──────────────────────

      {
        tag: 'wall_east_walk_1',
        name: 'Eastern Wall Walk',
        description: `The eastern wall walk offers a view over open terrain beyond the city. The road from the east gate stretches like a ribbon through farmland. A telescope is mounted on the parapet for the watch.`,
      },
      {
        tag: 'wall_east_walk_2',
        name: 'Eastern Wall Walk',
        description: `The walkway narrows where the wall angles slightly. A wooden shelter provides cover from rain, its bench occupied by a napping guard. The view east is peaceful — fields, a distant copse, and the faint blue of hills.`,
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

      // ── Southern Wall Walk ─────────────────────────────────────────────

      // SE tower — accessed from Eastwall/Southwall intersection
      { fromTag: 'int_4_4', toTag: 'wall_south_tower_e', direction: 'up' },
      { fromTag: 'wall_south_tower_e', toTag: 'int_4_4', direction: 'down' },

      // Walk E→W
      { fromTag: 'wall_south_tower_e', toTag: 'wall_south_walk_1', direction: 'west' },
      { fromTag: 'wall_south_walk_1', toTag: 'wall_south_tower_e', direction: 'east' },
      { fromTag: 'wall_south_walk_1', toTag: 'wall_south_walk_2', direction: 'west' },
      { fromTag: 'wall_south_walk_2', toTag: 'wall_south_walk_1', direction: 'east' },
      { fromTag: 'wall_south_walk_2', toTag: 'wall_south_tower_w', direction: 'west' },
      { fromTag: 'wall_south_tower_w', toTag: 'wall_south_walk_2', direction: 'east' },

      // SW tower — accessed from Westwall/Southwall intersection
      { fromTag: 'int_4_0', toTag: 'wall_south_tower_w', direction: 'up' },
      { fromTag: 'wall_south_tower_w', toTag: 'int_4_0', direction: 'down' },

      // ── Western Wall Walk ──────────────────────────────────────────────

      { fromTag: 'wall_south_tower_w', toTag: 'wall_west_walk_1', direction: 'north' },
      { fromTag: 'wall_west_walk_1', toTag: 'wall_south_tower_w', direction: 'south' },
      { fromTag: 'wall_west_walk_1', toTag: 'wall_west_walk_2', direction: 'north' },
      { fromTag: 'wall_west_walk_2', toTag: 'wall_west_walk_1', direction: 'south' },
      { fromTag: 'wall_west_walk_2', toTag: 'wall_west_tower_n', direction: 'north' },
      { fromTag: 'wall_west_tower_n', toTag: 'wall_west_walk_2', direction: 'south' },

      // NW tower — accessed from Westwall/Harbor intersection
      { fromTag: 'int_0_0', toTag: 'wall_west_tower_n', direction: 'up' },
      { fromTag: 'wall_west_tower_n', toTag: 'int_0_0', direction: 'down' },

      // ── Eastern Wall Walk ──────────────────────────────────────────────

      { fromTag: 'wall_south_tower_e', toTag: 'wall_east_walk_1', direction: 'north' },
      { fromTag: 'wall_east_walk_1', toTag: 'wall_south_tower_e', direction: 'south' },
      { fromTag: 'wall_east_walk_1', toTag: 'wall_east_walk_2', direction: 'north' },
      { fromTag: 'wall_east_walk_2', toTag: 'wall_east_walk_1', direction: 'south' },
      { fromTag: 'wall_east_walk_2', toTag: 'wall_east_tower_n', direction: 'north' },
      { fromTag: 'wall_east_tower_n', toTag: 'wall_east_walk_2', direction: 'south' },

      // NE tower — accessed from Eastwall/Harbor intersection
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
