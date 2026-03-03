/**
 * Residential District — ~10 rooms.
 * Southeast — quiet homes, intentionally sparse for future growth.
 */
import { DistrictData } from '../types.js';

export function getResidentialDistrict(): DistrictData {
  return {
    rooms: [
      // House 1 — off Eastwall Street
      {
        tag: 'residential_house_1_front',
        name: 'Modest Home',
        description: `A small, tidy home with whitewashed walls and a low ceiling. A braided rug covers the stone floor, and a fire smolders in a simple hearth. A shelf holds a few clay pots and a bundle of dried herbs.`,
      },
      {
        tag: 'residential_house_1_back',
        name: 'Back Room',
        description: `A cramped back room serves as both kitchen and bedroom. A narrow cot is pushed against one wall, its blanket neatly folded. A pot of something savory simmers on a small iron stove.`,
      },

      // House 2 — off Cloister Court
      {
        tag: 'residential_house_2_front',
        name: 'Stone Cottage',
        description: `Heavy stone walls and deep-set windows give this cottage a feeling of permanence. A rocking chair sits by the hearth, and a half-finished knitting project rests on its seat. The floor is swept clean.`,
      },

      // House 3 — off Eastwall Street
      {
        tag: 'residential_house_3_front',
        name: 'Narrow Townhouse',
        description: `A tall, narrow home squeezed between its neighbors. The front room is small but well-kept, with a writing desk by the window and bookshelves climbing the walls. A steep stair leads up.`,
      },
      {
        tag: 'residential_house_3_upper',
        name: 'Upstairs Bedroom',
        description: `The upper floor of the narrow townhouse is a single room beneath sloping eaves. A bed with a patchwork quilt takes up most of the space. A dormer window looks out over the rooftops toward the eastern wall.`,
      },

      // House 4 — off Cathedral Lane
      {
        tag: 'residential_house_4_front',
        name: 'Clergy Residence',
        description: `A spare, clean room with a simple wooden cross on the wall. The furniture is plain but well-made — a desk, a chair, and a narrow bed. A shelf holds prayer books and a worn rosary.`,
      },

      // House 5 — off Southwall Road
      {
        tag: 'residential_house_5_front',
        name: 'Gardener\'s Cottage',
        description: `Potted plants crowd every surface in this cluttered cottage. Climbing ivy frames the window, and seed packets are scattered across a workbench. The air smells of soil and green growth.`,
      },
      {
        tag: 'residential_house_5_back',
        name: 'Garden Shed',
        description: `A lean-to shed attached to the back of the cottage, filled with rakes, hoes, and coils of twine. Clay pots are stacked in towers, and bags of soil lean against the wall. A watering can sits by the door.`,
      },

      // Courtyard
      {
        tag: 'residential_courtyard',
        name: 'Residential Courtyard',
        description: `A small cobbled courtyard shared by several surrounding homes. A stone well stands at its center, its bucket hanging from a worn rope. Children's toys are scattered near a bench beneath an old apple tree.`,
        terrain: 'outdoor',
      },

      // Community well
      {
        tag: 'residential_well',
        name: 'Community Well',
        description: `A stone well with a shingled roof sits at the junction of two narrow lanes. The water is clear and cold. Neighbors gather here to fill buckets and share the day's news.`,
        terrain: 'outdoor',
      },
    ],

    exits: [
      // House 1 — off Eastwall Street between Cloister Court and Southwall (ns_4_3_1)
      { fromTag: 'ns_4_3_1', toTag: 'residential_house_1_front', direction: 'east' },
      { fromTag: 'residential_house_1_front', toTag: 'ns_4_3_1', direction: 'west' },
      { fromTag: 'residential_house_1_front', toTag: 'residential_house_1_back', direction: 'east' },
      { fromTag: 'residential_house_1_back', toTag: 'residential_house_1_front', direction: 'west' },

      // House 2 — off Cloister Court east of Cathedral Lane (ew_3_3_2)
      { fromTag: 'ew_3_3_2', toTag: 'residential_house_2_front', direction: 'south' },
      { fromTag: 'residential_house_2_front', toTag: 'ew_3_3_2', direction: 'north' },

      // House 3 — off Eastwall Street between Main and Cloister (ns_4_2_2)
      { fromTag: 'ns_4_2_2', toTag: 'residential_house_3_front', direction: 'east' },
      { fromTag: 'residential_house_3_front', toTag: 'ns_4_2_2', direction: 'west' },
      { fromTag: 'residential_house_3_front', toTag: 'residential_house_3_upper', direction: 'up' },
      { fromTag: 'residential_house_3_upper', toTag: 'residential_house_3_front', direction: 'down' },

      // House 4 — off Cathedral Lane between Cloister and Southwall (ns_3_3_2)
      { fromTag: 'ns_3_3_2', toTag: 'residential_house_4_front', direction: 'east' },
      { fromTag: 'residential_house_4_front', toTag: 'ns_3_3_2', direction: 'west' },

      // House 5 — off Southwall Road east of Cathedral Lane (ew_4_3_1)
      { fromTag: 'ew_4_3_1', toTag: 'residential_house_5_front', direction: 'south' },
      { fromTag: 'residential_house_5_front', toTag: 'ew_4_3_1', direction: 'north' },
      { fromTag: 'residential_house_5_front', toTag: 'residential_house_5_back', direction: 'south' },
      { fromTag: 'residential_house_5_back', toTag: 'residential_house_5_front', direction: 'north' },

      // Courtyard — off Eastwall Street (ns_4_3_2)
      { fromTag: 'ns_4_3_2', toTag: 'residential_courtyard', direction: 'east' },
      { fromTag: 'residential_courtyard', toTag: 'ns_4_3_2', direction: 'west' },

      // Well — off Cloister Court (ew_3_3_1)
      { fromTag: 'ew_3_3_1', toTag: 'residential_well', direction: 'south' },
      { fromTag: 'residential_well', toTag: 'ew_3_3_1', direction: 'north' },
    ],
  };
}
