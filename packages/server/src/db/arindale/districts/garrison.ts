/**
 * Garrison District — 18 building rooms.
 * Northeast quadrant, near the East Gate. Training hall, sheriff/jail, mayor, barracks.
 *
 * Grid validation map (steps north from Main St into block):
 * Block: Cathedral Ln (col 3) to Eastwall (col 4), Main St (row 2) to Marshal St (row 1)
 *
 *   Cathedral Ln  1east       2east       3east     Eastwall
 *      (0)                                            (4)
 *       |                                              |
 *    3: |     Barracks -- Bunks ----- Captain          |
 *       |                  |                           |
 *    2: |     Training    Armory                       |
 *       |       Room                                   |
 *    1: |     Training -- Sheriff --- Mayor            |
 *       |     Entrance     [down]                      |
 *    0: |    ew_2_3_1    ew_2_3_2   ew_2_3_3          |  ← Main Street
 *       |                                              |
 *   Barracks enters from Cathedral Lane (ns_3_1_1).
 *   Jail is underground beneath the Sheriff's Office.
 */
import { DistrictData } from '../types.js';

export function getGarrisonDistrict(): DistrictData {
  return {
    rooms: [
      // Training Hall — 3 rooms
      {
        tag: 'garrison_training_entrance',
        name: 'Training Hall',
        description: `A high-ceilinged hall of pale brick with weapon racks lining the walls. The sound of practice swords clashing echoes from a passage to the north. A stairway descends into darkness beneath the floor.`,
      },
      {
        tag: 'garrison_training_room',
        name: 'Training Room',
        description: `A spacious room with sand-covered floors and padded walls. Training dummies stand in neat rows, their surfaces showing the marks of countless practice sessions. A grizzled instructor watches newcomers with a critical eye.`,
        features: { training: { enabled: true, minLevel: 1, maxLevel: 999 } },
      },
      {
        tag: 'garrison_training_underground',
        name: 'Underground Chamber',
        description: `A rough-hewn chamber beneath the training hall. The ceiling is low and the air is damp. A passage has been started in the far wall but abandoned, its rubble piled to one side. This area seems unused.`,
      },

      // Sheriff's Office + Jail — 10 rooms
      {
        tag: 'garrison_sheriff',
        name: "Sheriff's Office",
        description: `A tidy office with a large desk covered in reports and writs. Wanted posters line the walls, some fresh, others yellowed with age. A rack of confiscated weapons stands behind the door. An iron ring is bolted to the floor near the back wall, and a heavy trapdoor leads down to the jail beneath.`,
      },
      {
        tag: 'garrison_jail_corridor_1',
        name: 'Jail Corridor',
        description: `A dank stone corridor lit by guttering torches. Iron-barred cell doors line both sides. The air smells of damp straw and unwashed bodies. Water drips somewhere in the darkness ahead.`,
      },
      {
        tag: 'garrison_jail_corridor_2',
        name: 'Jail Corridor',
        description: `The corridor continues between more cells. Scratched tally marks cover the walls where prisoners have counted their days. A rat skitters along the base of the wall and vanishes into a crack.`,
      },
      {
        tag: 'garrison_jail_corridor_3',
        name: 'Jail Corridor',
        description: `The deepest stretch of the jail corridor ends at a solid stone wall. The cells here are smaller and darker than those near the stairs. A rusted chain dangles from an empty wall bracket.`,
      },
      {
        tag: 'garrison_jail_cell_1',
        name: 'Jail Cell',
        description: `A cramped cell with a straw pallet on the stone floor and a bucket in the corner. Iron bars form the only wall facing the corridor. Scratches in the stone mark the passage of forgotten days.`,
      },
      {
        tag: 'garrison_jail_cell_2',
        name: 'Jail Cell',
        description: `A narrow cell barely wide enough to lie down in. The straw on the floor is damp and the walls are slick with moisture. Someone has scratched a crude face into the stone.`,
      },
      {
        tag: 'garrison_jail_cell_3',
        name: 'Jail Cell',
        description: `This cell is slightly larger than the others, perhaps once reserved for prisoners of rank. The straw is fresher, and a wooden stool sits in the corner. The iron bars are as unyielding as the rest.`,
      },
      {
        tag: 'garrison_jail_cell_4',
        name: 'Jail Cell',
        description: `A dark cell at the end of the corridor. A thin crack in the ceiling lets in a thread of light that traces a bright line across the floor. The walls bear deep gouges, as if clawed.`,
      },
      {
        tag: 'garrison_jail_cell_5',
        name: 'Jail Cell',
        description: `Moldy straw covers the floor of this damp cell. An iron ring set into the wall holds the remains of a broken shackle. The air is thick and still.`,
      },
      {
        tag: 'garrison_jail_cell_6',
        name: 'Jail Cell',
        description: `The deepest cell in the jail. No light reaches here except what spills from the corridor torches. A pile of rags in the corner might once have been a blanket. The silence is oppressive.`,
      },

      // Mayor's Office
      {
        tag: 'garrison_mayor',
        name: "Mayor's Office",
        description: `A well-appointed office with a mahogany desk and leather chairs. Maps of the city and surrounding lands cover one wall. A seal of office sits on the desk beside a stack of unsigned proclamations.`,
      },

      // Guard Barracks — 4 rooms
      {
        tag: 'garrison_barracks_entrance',
        name: 'Guard Barracks',
        description: `The entrance hall of the city guard barracks is functional and unadorned. Duty rosters are pinned to a board by the door. A weapons rack holds practice swords and bucklers for the watch rotation.`,
      },
      {
        tag: 'garrison_barracks_bunks',
        name: 'Bunk Room',
        description: `Double-stacked bunks line both walls of this long room. Footlockers sit at the end of each bed, secured with simple padlocks. A few off-duty guards sleep or play cards at a table.`,
      },
      {
        tag: 'garrison_barracks_armory',
        name: 'Barracks Armory',
        description: `Racks of spears, swords, and crossbows stand against the walls, each weapon oiled and ready. Stacks of chainmail shirts and leather gambesons fill wooden shelves. A quartermaster's ledger hangs from a chain.`,
      },
      {
        tag: 'garrison_barracks_captain',
        name: "Captain's Quarters",
        description: `The barracks captain's private room is small but comfortable. A desk covered in reports sits beneath a narrow window. A sword and shield hang on the wall beside a faded campaign map.`,
      },
    ],

    exits: [
      // Training Hall — off Main Street near Cathedral Ln (ew_2_3_1)
      // Grid: entrance(1,3) → training_room(1,2) north, underground below
      { fromTag: 'ew_2_3_1', toTag: 'garrison_training_entrance', direction: 'north' },
      { fromTag: 'garrison_training_entrance', toTag: 'ew_2_3_1', direction: 'south' },
      { fromTag: 'garrison_training_entrance', toTag: 'garrison_training_room', direction: 'north' },
      { fromTag: 'garrison_training_room', toTag: 'garrison_training_entrance', direction: 'south' },
      { fromTag: 'garrison_training_entrance', toTag: 'garrison_training_underground', direction: 'down' },
      { fromTag: 'garrison_training_underground', toTag: 'garrison_training_entrance', direction: 'up' },

      // Sheriff's Office — off Main Street (ew_2_3_2)
      // Grid: sheriff(2,3), jail directly below
      { fromTag: 'ew_2_3_2', toTag: 'garrison_sheriff', direction: 'north' },
      { fromTag: 'garrison_sheriff', toTag: 'ew_2_3_2', direction: 'south' },

      // Sheriff → jail (down through trapdoor)
      { fromTag: 'garrison_sheriff', toTag: 'garrison_jail_corridor_1', direction: 'down' },
      { fromTag: 'garrison_jail_corridor_1', toTag: 'garrison_sheriff', direction: 'up' },

      // Jail corridors chained N/S
      { fromTag: 'garrison_jail_corridor_1', toTag: 'garrison_jail_corridor_2', direction: 'south' },
      { fromTag: 'garrison_jail_corridor_2', toTag: 'garrison_jail_corridor_1', direction: 'north' },
      { fromTag: 'garrison_jail_corridor_2', toTag: 'garrison_jail_corridor_3', direction: 'south' },
      { fromTag: 'garrison_jail_corridor_3', toTag: 'garrison_jail_corridor_2', direction: 'north' },

      // Cells off corridors (east/west alternating)
      { fromTag: 'garrison_jail_corridor_1', toTag: 'garrison_jail_cell_1', direction: 'east' },
      { fromTag: 'garrison_jail_cell_1', toTag: 'garrison_jail_corridor_1', direction: 'west' },
      { fromTag: 'garrison_jail_corridor_1', toTag: 'garrison_jail_cell_2', direction: 'west' },
      { fromTag: 'garrison_jail_cell_2', toTag: 'garrison_jail_corridor_1', direction: 'east' },

      { fromTag: 'garrison_jail_corridor_2', toTag: 'garrison_jail_cell_3', direction: 'east' },
      { fromTag: 'garrison_jail_cell_3', toTag: 'garrison_jail_corridor_2', direction: 'west' },
      { fromTag: 'garrison_jail_corridor_2', toTag: 'garrison_jail_cell_4', direction: 'west' },
      { fromTag: 'garrison_jail_cell_4', toTag: 'garrison_jail_corridor_2', direction: 'east' },

      { fromTag: 'garrison_jail_corridor_3', toTag: 'garrison_jail_cell_5', direction: 'east' },
      { fromTag: 'garrison_jail_cell_5', toTag: 'garrison_jail_corridor_3', direction: 'west' },
      { fromTag: 'garrison_jail_corridor_3', toTag: 'garrison_jail_cell_6', direction: 'west' },
      { fromTag: 'garrison_jail_cell_6', toTag: 'garrison_jail_corridor_3', direction: 'east' },

      // Mayor's Office — off Main Street near Eastwall (ew_2_3_3)
      { fromTag: 'ew_2_3_3', toTag: 'garrison_mayor', direction: 'north' },
      { fromTag: 'garrison_mayor', toTag: 'ew_2_3_3', direction: 'south' },

      // Guard Barracks — off Cathedral Lane between Marshal and Main (ns_3_1_1)
      // Grid: entrance(1,1) → bunks(2,1) → captain(3,1), armory(2,2) south of bunks
      { fromTag: 'ns_3_1_1', toTag: 'garrison_barracks_entrance', direction: 'east' },
      { fromTag: 'garrison_barracks_entrance', toTag: 'ns_3_1_1', direction: 'west' },
      { fromTag: 'garrison_barracks_entrance', toTag: 'garrison_barracks_bunks', direction: 'east' },
      { fromTag: 'garrison_barracks_bunks', toTag: 'garrison_barracks_entrance', direction: 'west' },
      { fromTag: 'garrison_barracks_bunks', toTag: 'garrison_barracks_armory', direction: 'south' },
      { fromTag: 'garrison_barracks_armory', toTag: 'garrison_barracks_bunks', direction: 'north' },
      { fromTag: 'garrison_barracks_bunks', toTag: 'garrison_barracks_captain', direction: 'east' },
      { fromTag: 'garrison_barracks_captain', toTag: 'garrison_barracks_bunks', direction: 'west' },
    ],

    doors: [
      // 6 jail cell doors — locked, strong pick difficulty, unbashable
      ...(['garrison_jail_cell_1', 'garrison_jail_cell_2', 'garrison_jail_cell_3',
           'garrison_jail_cell_4', 'garrison_jail_cell_5', 'garrison_jail_cell_6'] as const).map((cellTag, i) => {
        const corridorNum = Math.floor(i / 2) + 1;
        const corridorTag = `garrison_jail_corridor_${corridorNum}`;
        const dir = i % 2 === 0 ? 'east' : 'west';
        const oppDir = i % 2 === 0 ? 'west' : 'east';
        return {
          name: `jail cell door ${i + 1}`,
          doorType: 'physical' as const,
          entryTag: corridorTag,
          entryDirection: dir,
          exitTag: cellTag,
          exitDirection: oppDir,
          defaultState: 'locked' as const,
          autoResetSeconds: 300,
          hasLock: true,
          pickDifficultyMin: 80,
          pickDifficultyMax: 150,
          bashDifficulty: 500,
        };
      }),
    ],
  };
}
