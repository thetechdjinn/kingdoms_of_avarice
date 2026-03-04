/**
 * Harbor District — 17 building rooms.
 * North of Marshal Street, along Harbor Road.
 * Tavern, inn, docks, warehouses.
 */
import { DistrictData } from '../types.js';

export function getHarborDistrict(): DistrictData {
  return {
    rooms: [
      // Tavern — 3 rooms
      {
        tag: 'harbor_tavern',
        name: 'The Salty Dog Tavern',
        description: `A warm glow and the buzz of conversation fill this busy harbor tavern. Sailors and dockworkers crowd the bar, and a bard plucks a lute in the far corner. The air is thick with pipe smoke and the smell of cheap ale.`,
      },
      {
        tag: 'harbor_tavern_back',
        name: 'Tavern Back Room',
        description: `A quieter room behind the main bar, furnished with a few scarred tables and benches. A dartboard hangs on the wall, its surface pockmarked with holes. Hushed conversations take place in the dimmer corners.`,
      },
      {
        tag: 'harbor_tavern_storage',
        name: 'Tavern Storage Room',
        description: `Kegs of ale and crates of bottled spirits fill this cramped storeroom. The floor is sticky with spilled drink. A trapdoor in the floor suggests a cellar below, but it's nailed shut.`,
      },

      // Inn — 7 rooms (near Town Square, dual entrance: Main St + King's Rd)
      {
        tag: 'harbor_inn',
        name: "The Traveler's Rest",
        description: `A welcoming inn with a polished front desk and a sitting area by a stone fireplace. The innkeeper stands behind the counter, sorting room keys on a pegboard. The sounds of the busy town square drift in through the windows.`,
      },
      {
        tag: 'harbor_inn_dining',
        name: 'Inn Dining Room',
        description: `Round tables with checkered cloths fill this cozy dining room. The smell of stew and fresh bread drifts from the kitchen beyond. A few guests linger over their meals, talking softly.`,
      },
      {
        tag: 'harbor_inn_stairs',
        name: 'Inn Stairway',
        description: `A narrow wooden stairway leads up from the back of the inn. The steps creak underfoot, and the banister is worn smooth by countless hands.`,
      },
      {
        tag: 'harbor_inn_hallway',
        name: 'Upstairs Hallway',
        description: `A carpeted hallway runs between numbered guest room doors. Oil lamps in wall sconces cast a warm glow. The street noise is muffled up here, replaced by the occasional creak of old timbers.`,
      },
      {
        tag: 'harbor_inn_room',
        name: 'Guest Room',
        description: `A small but clean room with a bed, a washstand, and a window overlooking the street below. The linens are freshly laundered, and a candle sits on the nightstand beside a book of local tales.`,
      },
      {
        tag: 'harbor_inn_room_2',
        name: 'Guest Room',
        description: `A modest room with a straw-stuffed mattress and a wooden chest at the foot of the bed. A basin of water sits on a small table beneath a shuttered window. The room smells of clean linen and beeswax.`,
      },
      {
        tag: 'harbor_inn_room_3',
        name: 'Guest Room',
        description: `The largest of the guest rooms, with a proper bed frame and a writing desk by the window. A woven rug covers the floorboards, and a wardrobe stands against the far wall. A vase of dried flowers sits on the desk.`,
      },

      // Docks — 5 slips
      {
        tag: 'harbor_dock_1',
        name: 'Western Dock',
        description: `The westernmost dock extends over dark water on thick wooden pilings. Empty mooring posts stand along its length, their ropes coiled and waiting. The planks are weathered gray and slick with spray.`,
      },
      {
        tag: 'harbor_dock_2',
        name: 'Fishing Dock',
        description: `Nets hang drying from wooden frames along this dock. Small fishing boats bob in their moorings, their hulls crusted with barnacles. The sharp smell of fish guts rises from the cleaning tables at the end.`,
      },
      {
        tag: 'harbor_dock_3',
        name: 'Central Dock',
        description: `The largest dock in the harbor, wide enough for heavy cargo. Iron bollards are sunk into the planking at regular intervals. Crane arms swing overhead, ready to load or unload the next vessel.`,
      },
      {
        tag: 'harbor_dock_4',
        name: 'Trade Dock',
        description: `Stacked crates bearing foreign marks line this dock, waiting to be carted into the city. A customs officer's booth sits at the landward end, its shutters open. The dock smells of tar and exotic spices.`,
      },
      {
        tag: 'harbor_dock_5',
        name: 'Eastern Dock',
        description: `The easternmost dock is quieter than the others, its berths mostly empty. A lone rowboat is tied to a post, its oars shipped. Gulls perch on the mooring posts, watching the water for fish.`,
      },

      // Warehouses
      {
        tag: 'harbor_warehouse_1',
        name: 'Harbor Warehouse',
        description: `A cavernous warehouse smelling of sawdust and salt. Crates and barrels are stacked to the rafters in orderly rows, each marked with a merchant's seal. A loading door at the far end opens onto the waterfront.`,
      },
      {
        tag: 'harbor_warehouse_2',
        name: 'Old Warehouse',
        description: `This warehouse has seen better days. The roof leaks in places, leaving dark stains on the floor. Most of the storage space is empty, though a few tarped mounds suggest someone still uses it.`,
      },
    ],

    exits: [
      // Tavern — off Harbor Road east of Market St (ew_0_1_2)
      { fromTag: 'ew_0_1_2', toTag: 'harbor_tavern', direction: 'north' },
      { fromTag: 'harbor_tavern', toTag: 'ew_0_1_2', direction: 'south' },
      { fromTag: 'harbor_tavern', toTag: 'harbor_tavern_back', direction: 'east' },
      { fromTag: 'harbor_tavern_back', toTag: 'harbor_tavern', direction: 'west' },
      { fromTag: 'harbor_tavern', toTag: 'harbor_tavern_storage', direction: 'west' },
      { fromTag: 'harbor_tavern_storage', toTag: 'harbor_tavern', direction: 'east' },

      // Inn — near Town Square: two entrances (Main St south, King's Rd east)
      { fromTag: 'ew_2_2_1', toTag: 'harbor_inn', direction: 'south' },
      { fromTag: 'harbor_inn', toTag: 'ew_2_2_1', direction: 'north' },
      { fromTag: 'ns_2_2_1', toTag: 'harbor_inn', direction: 'east' },
      { fromTag: 'harbor_inn', toTag: 'ns_2_2_1', direction: 'west' },
      // Main room → south → Dining
      { fromTag: 'harbor_inn', toTag: 'harbor_inn_dining', direction: 'south' },
      { fromTag: 'harbor_inn_dining', toTag: 'harbor_inn', direction: 'north' },
      // Dining → east → Stairs (ticket door between dining and stairs)
      { fromTag: 'harbor_inn_dining', toTag: 'harbor_inn_stairs', direction: 'east' },
      { fromTag: 'harbor_inn_stairs', toTag: 'harbor_inn_dining', direction: 'west' },
      // Stairs → up → Hallway
      { fromTag: 'harbor_inn_stairs', toTag: 'harbor_inn_hallway', direction: 'up' },
      { fromTag: 'harbor_inn_hallway', toTag: 'harbor_inn_stairs', direction: 'down' },
      // Hallway → 3 guest rooms
      { fromTag: 'harbor_inn_hallway', toTag: 'harbor_inn_room', direction: 'east' },
      { fromTag: 'harbor_inn_room', toTag: 'harbor_inn_hallway', direction: 'west' },
      { fromTag: 'harbor_inn_hallway', toTag: 'harbor_inn_room_2', direction: 'west' },
      { fromTag: 'harbor_inn_room_2', toTag: 'harbor_inn_hallway', direction: 'east' },
      { fromTag: 'harbor_inn_hallway', toTag: 'harbor_inn_room_3', direction: 'north' },
      { fromTag: 'harbor_inn_room_3', toTag: 'harbor_inn_hallway', direction: 'south' },

      // Docks — off Harbor Road, accessed from int_0_1 (Harbor Rd / Market St)
      // Dock row runs E/W north of Harbor Road
      { fromTag: 'int_0_1', toTag: 'harbor_dock_3', direction: 'north' },
      { fromTag: 'harbor_dock_3', toTag: 'int_0_1', direction: 'south' },
      { fromTag: 'harbor_dock_3', toTag: 'harbor_dock_2', direction: 'west' },
      { fromTag: 'harbor_dock_2', toTag: 'harbor_dock_3', direction: 'east' },
      { fromTag: 'harbor_dock_2', toTag: 'harbor_dock_1', direction: 'west' },
      { fromTag: 'harbor_dock_1', toTag: 'harbor_dock_2', direction: 'east' },
      { fromTag: 'harbor_dock_3', toTag: 'harbor_dock_4', direction: 'east' },
      { fromTag: 'harbor_dock_4', toTag: 'harbor_dock_3', direction: 'west' },
      { fromTag: 'harbor_dock_4', toTag: 'harbor_dock_5', direction: 'east' },
      { fromTag: 'harbor_dock_5', toTag: 'harbor_dock_4', direction: 'west' },

      // Warehouses — off Harbor Road (ew_0_0_2 and ew_0_0_3)
      { fromTag: 'ew_0_0_2', toTag: 'harbor_warehouse_1', direction: 'north' },
      { fromTag: 'harbor_warehouse_1', toTag: 'ew_0_0_2', direction: 'south' },
      { fromTag: 'ew_0_0_3', toTag: 'harbor_warehouse_2', direction: 'north' },
      { fromTag: 'harbor_warehouse_2', toTag: 'ew_0_0_3', direction: 'south' },
    ],

    doors: [
      // Inn stairway door — between dining room and stairs
      // TODO: Re-lock with requiredItemTag: 'inn_room_ticket' once innkeeper merchant sells tickets
      {
        name: 'inn stairway door',
        doorType: 'physical',
        entryTag: 'harbor_inn_dining',
        entryDirection: 'east',
        exitTag: 'harbor_inn_stairs',
        exitDirection: 'west',
        defaultState: 'closed',
        autoResetSeconds: 30,
        hasLock: false,
        pickDifficultyMin: 0,
        pickDifficultyMax: 0,
        bashDifficulty: 0,
      },
    ],
  };
}
