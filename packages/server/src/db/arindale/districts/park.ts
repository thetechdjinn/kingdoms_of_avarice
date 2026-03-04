/**
 * Park District — 9 rooms.
 * Northwest quadrant. A wide open green space — all rooms interconnected.
 * Block: Westwall (col 0) to Market St (col 1), Harbor Rd (row 0) to Marshal St (row 1)
 * Four entries — one per side: Marshal St, Harbor Rd, Westwall, Market St.
 *
 * Grid validation map (steps north from Marshal St into block):
 *
 *   Westwall   1east          2east          3east     Market St
 *     (0)                                                (4)
 *      |                                                  |
 *   3: |     Grove ------- Overlook ----- Quiet Bench    |
 *      |       |               |               |          |
 *   2: |     Flower ------ Reflecting --- King's Statue  |
 *      |       |               |               |          |
 *   1: |     Promenade --- ENTRANCE ----- Mossy Steps    |
 *      |                                                  |
 *   0: |    ew_1_0_1      ew_1_0_2       ew_1_0_3       |  ← Marshal Street
 *      |                                                  |
 *   All rooms connected to cardinal neighbors (wide open park feel).
 */
import { DistrictData } from '../types.js';

export function getParkDistrict(): DistrictData {
  return {
    rooms: [
      {
        tag: 'park_entrance',
        name: 'Park Entrance',
        description: `A wrought-iron archway marks the entrance to Arindale Park. A gravel path leads north beneath the shade of towering oaks into the green heart of the park. A wooden sign lists the park's rules in faded gilt lettering.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_flower_garden',
        name: 'Flower Garden',
        description: `Beds of bright flowers line a curving path — marigolds, foxglove, and tall blue delphiniums. Butterflies drift between the blossoms, and the air is sweet with pollen. A gardener kneels nearby, pulling weeds.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_shaded_grove',
        name: 'Shaded Grove',
        description: `Ancient oaks form a dense canopy overhead, their branches intertwined. The ground is carpeted with moss and fallen leaves. Birdsong echoes in the green shade, and the temperature is noticeably cooler.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_reflecting_pool',
        name: 'Reflecting Pool',
        description: `A long, shallow pool of still water stretches between low stone walls. The surface mirrors the sky with perfect clarity. Stone benches line the pool's edge, worn smooth by generations of visitors.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_kings_statue',
        name: "King's Statue",
        description: `A large bronze statue of a past king stands on a granite pedestal at the heart of the park. The king gazes north toward his castle, one hand resting on a sword, the other raised in benediction. Pigeons roost on his shoulders.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_overlook',
        name: 'Park Overlook',
        description: `A slight rise at the park's edge offers a view over the treetops toward the harbor. The masts of ships are visible above the rooftops, and the castle's towers rise to the north. A carved stone railing marks the edge.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_promenade',
        name: 'Grand Promenade',
        description: `A wide, straight walkway lined with stone columns leads toward a bronze statue visible to the north. Neatly trimmed hedges flank the promenade, and iron benches sit at regular intervals.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_mossy_steps',
        name: 'Mossy Steps',
        description: `Shallow stone steps descend a gentle slope beneath the shade of old trees. Moss fills the cracks between the stones, and ferns grow in the damp gaps. The air smells of earth and green growing things.`,
        terrain: 'outdoor',
      },
      {
        tag: 'park_quiet_bench',
        name: 'Quiet Bench',
        description: `A solitary wooden bench sits at the park's highest point, half-hidden by overgrown bushes. It faces a small clearing where wildflowers grow in undisturbed profusion. From here you can see the king's statue below and the treetops beyond.`,
        terrain: 'outdoor',
      },
    ],

    exits: [
      // ── Street entries (one per side, center of each street) ──

      // Marshal Street (south) → Entrance
      { fromTag: 'ew_1_0_2', toTag: 'park_entrance', direction: 'north' },
      { fromTag: 'park_entrance', toTag: 'ew_1_0_2', direction: 'south' },

      // Harbor Road (north) → Overlook
      { fromTag: 'ew_0_0_2', toTag: 'park_overlook', direction: 'south' },
      { fromTag: 'park_overlook', toTag: 'ew_0_0_2', direction: 'north' },

      // Westwall (west) → Flower Garden
      { fromTag: 'ns_0_0_2', toTag: 'park_flower_garden', direction: 'east' },
      { fromTag: 'park_flower_garden', toTag: 'ns_0_0_2', direction: 'west' },

      // Market Street (east) → King's Statue
      { fromTag: 'ns_1_0_2', toTag: 'park_kings_statue', direction: 'west' },
      { fromTag: 'park_kings_statue', toTag: 'ns_1_0_2', direction: 'east' },

      // ── All cardinal adjacencies (wide open park — every neighbor connected) ──

      // Row 1 (nearest Marshal St): Promenade — Entrance — Mossy Steps
      { fromTag: 'park_promenade', toTag: 'park_entrance', direction: 'east' },
      { fromTag: 'park_entrance', toTag: 'park_promenade', direction: 'west' },
      { fromTag: 'park_entrance', toTag: 'park_mossy_steps', direction: 'east' },
      { fromTag: 'park_mossy_steps', toTag: 'park_entrance', direction: 'west' },

      // Row 2 (middle): Flower Garden — Reflecting Pool — King's Statue
      { fromTag: 'park_flower_garden', toTag: 'park_reflecting_pool', direction: 'east' },
      { fromTag: 'park_reflecting_pool', toTag: 'park_flower_garden', direction: 'west' },
      { fromTag: 'park_reflecting_pool', toTag: 'park_kings_statue', direction: 'east' },
      { fromTag: 'park_kings_statue', toTag: 'park_reflecting_pool', direction: 'west' },

      // Row 3 (deepest): Grove — Overlook — Quiet Bench
      { fromTag: 'park_shaded_grove', toTag: 'park_overlook', direction: 'east' },
      { fromTag: 'park_overlook', toTag: 'park_shaded_grove', direction: 'west' },
      { fromTag: 'park_overlook', toTag: 'park_quiet_bench', direction: 'east' },
      { fromTag: 'park_quiet_bench', toTag: 'park_overlook', direction: 'west' },

      // Col 1 (west): Promenade — Flower — Grove
      { fromTag: 'park_promenade', toTag: 'park_flower_garden', direction: 'north' },
      { fromTag: 'park_flower_garden', toTag: 'park_promenade', direction: 'south' },
      { fromTag: 'park_flower_garden', toTag: 'park_shaded_grove', direction: 'north' },
      { fromTag: 'park_shaded_grove', toTag: 'park_flower_garden', direction: 'south' },

      // Col 2 (center): Entrance — Reflecting — Overlook
      { fromTag: 'park_entrance', toTag: 'park_reflecting_pool', direction: 'north' },
      { fromTag: 'park_reflecting_pool', toTag: 'park_entrance', direction: 'south' },
      { fromTag: 'park_reflecting_pool', toTag: 'park_overlook', direction: 'north' },
      { fromTag: 'park_overlook', toTag: 'park_reflecting_pool', direction: 'south' },

      // Col 3 (east): Mossy — King's Statue — Quiet Bench
      { fromTag: 'park_mossy_steps', toTag: 'park_kings_statue', direction: 'north' },
      { fromTag: 'park_kings_statue', toTag: 'park_mossy_steps', direction: 'south' },
      { fromTag: 'park_kings_statue', toTag: 'park_quiet_bench', direction: 'north' },
      { fromTag: 'park_quiet_bench', toTag: 'park_kings_statue', direction: 'south' },
    ],
  };
}
