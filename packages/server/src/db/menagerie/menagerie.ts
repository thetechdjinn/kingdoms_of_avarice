/**
 * The Iridescent Menagerie — 64 rooms.
 * Sub-zone branching off the Arindale Sewer west tunnels.
 * Alchemical contamination zone — a cracked containment vessel has leaked
 * iridescent reagent through the tunnels, mutating creatures and crystallizing
 * the stonework. A rogue alchemist cult operates from the deepest chambers.
 *
 * Entered from sewer_entrance_menagerie (west_tunnels) going down/up.
 *
 * Layout: See areas/the_iridescent_menagerie/plan.md for the canonical ASCII map.
 *
 * Map orientation: LEFT = west (toward entrance), RIGHT = east (deeper).
 * UP = north, DOWN = south (standard).
 *
 * Zone assignments for descriptions:
 *   Rows 0-2: 'outer' (faint contamination, near entrance)
 *   Rows 3-4: 'mid'   (heavy contamination)
 *   Rows 5-6: 'inner' (saturated crystallization)
 *   Row 7:    hand-written only (core/boss area)
 */
import { DistrictData } from '../arindale/types.js';
import {
  menagerieDescription,
  maybeAddMenagerieDetail,
  menagerieRoomName,
  MenagerieSection,
} from './descriptions.js';

const AREA = 'The Iridescent Menagerie';
const TERRAIN = 'underground';

function desc(section: MenagerieSection, tag: string): string {
  return maybeAddMenagerieDetail(menagerieDescription(section, tag), tag, section);
}

function room(tag: string, name: string, description: string) {
  return { tag, name, description, area: AREA, terrain: TERRAIN };
}

export function getIridescentMenagerie(): DistrictData {
  return {
    rooms: [
      // === Row 0 (2 rooms) ===
      room('im_nest_1', 'Mutant Nest',
        `A nesting area for mutated creatures. Shredded material and glowing fur line the walls. The bones here are wrong — too large, too numerous.`),
      room('im_crystal_1', 'Crystal Chamber',
        `The reagent has crystallized on the walls and ceiling, forming jagged luminous formations. Beautiful and deeply wrong.`),

      // === Row 1 (9 rooms) ===
      room('im_1', menagerieRoomName('outer', 'im_1'), desc('outer', 'im_1')),
      room('im_2', menagerieRoomName('outer', 'im_2'), desc('outer', 'im_2')),
      room('im_3', menagerieRoomName('outer', 'im_3'), desc('outer', 'im_3')),
      room('im_4', menagerieRoomName('outer', 'im_4'), desc('outer', 'im_4')),
      room('im_5', menagerieRoomName('outer', 'im_5'), desc('outer', 'im_5')),
      room('im_6', menagerieRoomName('outer', 'im_6'), desc('outer', 'im_6')),
      room('im_7', menagerieRoomName('outer', 'im_7'), desc('outer', 'im_7')),
      room('im_8', menagerieRoomName('outer', 'im_8'), desc('outer', 'im_8')),
      room('im_9', menagerieRoomName('outer', 'im_9'), desc('outer', 'im_9')),

      // === Row 2 (10 rooms) ===
      room('im_entrance', 'Iridescent Threshold',
        `The transition point between sewer and menagerie. Sewer stone gives way to walls streaked with luminous residue. The chemical smell is immediate. A shaft leads up to the sewer tunnels above.`),
      room('im_10', menagerieRoomName('outer', 'im_10'), desc('outer', 'im_10')),
      room('im_11', menagerieRoomName('outer', 'im_11'), desc('outer', 'im_11')),
      room('im_12', menagerieRoomName('outer', 'im_12'), desc('outer', 'im_12')),
      room('im_13', menagerieRoomName('outer', 'im_13'), desc('outer', 'im_13')),
      room('im_pool_1', 'Glowing Pool',
        `A chamber where iridescent liquid has pooled deeply. The glow is intense, casting strange reflections. Things move beneath the surface.`),
      room('im_14', menagerieRoomName('outer', 'im_14'), desc('outer', 'im_14')),
      room('im_15', menagerieRoomName('outer', 'im_15'), desc('outer', 'im_15')),
      room('im_16', menagerieRoomName('outer', 'im_16'), desc('outer', 'im_16')),
      room('im_nest_2', 'Mutant Nest',
        `A second nesting chamber, larger and fouler. The creatures here have been exposed longer. Shed skin and luminous secretions coat every surface.`),

      // === Row 3 (10 rooms) ===
      room('im_17', menagerieRoomName('mid', 'im_17'), desc('mid', 'im_17')),
      room('im_18', menagerieRoomName('mid', 'im_18'), desc('mid', 'im_18')),
      room('im_19', menagerieRoomName('mid', 'im_19'), desc('mid', 'im_19')),
      room('im_20', menagerieRoomName('mid', 'im_20'), desc('mid', 'im_20')),
      room('im_21', menagerieRoomName('mid', 'im_21'), desc('mid', 'im_21')),
      room('im_cavern', 'Iridescent Cavern',
        `A large open chamber saturated with contamination. The air itself shimmers with suspended reagent particles, making distances hard to judge.`),
      room('im_22', menagerieRoomName('mid', 'im_22'), desc('mid', 'im_22')),
      room('im_23', menagerieRoomName('mid', 'im_23'), desc('mid', 'im_23')),
      room('im_24', menagerieRoomName('mid', 'im_24'), desc('mid', 'im_24')),
      room('im_25', menagerieRoomName('mid', 'im_25'), desc('mid', 'im_25')),

      // === Row 4 (10 rooms) ===
      room('im_26', menagerieRoomName('mid', 'im_26'), desc('mid', 'im_26')),
      room('im_pool_2', 'Glowing Pool',
        `Another chamber flooded with luminous reagent. The pool here is deeper and more turbulent, the liquid bubbling sluggishly with chemical reactions.`),
      room('im_27', menagerieRoomName('mid', 'im_27'), desc('mid', 'im_27')),
      room('im_28', menagerieRoomName('mid', 'im_28'), desc('mid', 'im_28')),
      room('im_29', menagerieRoomName('mid', 'im_29'), desc('mid', 'im_29')),
      room('im_30', menagerieRoomName('mid', 'im_30'), desc('mid', 'im_30')),
      room('im_31', menagerieRoomName('mid', 'im_31'), desc('mid', 'im_31')),
      room('im_lab', 'Wrecked Laboratory',
        `Remnants of alchemical equipment — overturned tables, shattered glass vessels, burst copper pipes. All overrun by crystallized contamination.`),
      room('im_32', menagerieRoomName('mid', 'im_32'), desc('mid', 'im_32')),
      room('im_33', menagerieRoomName('mid', 'im_33'), desc('mid', 'im_33')),

      // === Row 5 (10 rooms) ===
      room('im_34', menagerieRoomName('inner', 'im_34'), desc('inner', 'im_34')),
      room('im_35', menagerieRoomName('inner', 'im_35'), desc('inner', 'im_35')),
      room('im_36', menagerieRoomName('inner', 'im_36'), desc('inner', 'im_36')),
      room('im_37', menagerieRoomName('inner', 'im_37'), desc('inner', 'im_37')),
      room('im_38', menagerieRoomName('inner', 'im_38'), desc('inner', 'im_38')),
      room('im_39', menagerieRoomName('inner', 'im_39'), desc('inner', 'im_39')),
      room('im_40', menagerieRoomName('inner', 'im_40'), desc('inner', 'im_40')),
      room('im_41', menagerieRoomName('inner', 'im_41'), desc('inner', 'im_41')),
      room('im_42', menagerieRoomName('inner', 'im_42'), desc('inner', 'im_42')),
      room('im_43', menagerieRoomName('inner', 'im_43'), desc('inner', 'im_43')),

      // === Row 6 (10 rooms) ===
      room('im_44', menagerieRoomName('inner', 'im_44'), desc('inner', 'im_44')),
      room('im_45', menagerieRoomName('inner', 'im_45'), desc('inner', 'im_45')),
      room('im_46', menagerieRoomName('inner', 'im_46'), desc('inner', 'im_46')),
      room('im_crystal_2', 'Crystal Chamber',
        `A cavern dominated by massive crystal growths. The formations pulse with inner light, humming at a frequency felt in the teeth.`),
      room('im_vessel', 'Containment Vessel',
        `The cracked vessel — source of the leak. A massive copper and iron container, its seams split, iridescent reagent streaming from the fractures in thick luminous rivulets.`),
      room('im_47', menagerieRoomName('inner', 'im_47'), desc('inner', 'im_47')),
      room('im_48', menagerieRoomName('inner', 'im_48'), desc('inner', 'im_48')),
      room('im_49', menagerieRoomName('inner', 'im_49'), desc('inner', 'im_49')),
      room('im_50', menagerieRoomName('inner', 'im_50'), desc('inner', 'im_50')),
      room('im_51', menagerieRoomName('inner', 'im_51'), desc('inner', 'im_51')),

      // === Row 7 (3 rooms — core/boss area, hand-written) ===
      room('im_52', 'Reagent Conduit',
        `A narrow channel carved by the flow of concentrated reagent. The walls are smooth and glassy, polished by years of liquid contamination. The glow is blinding. The passage leads toward the source.`),
      room('im_den', "Alchemist's Den",
        `A crude workshop carved from the tunnel wall. Cult robes hang from an iron hook. Malachi symbols are scratched into the stone. Scattered notes and vials litter a rough workbench.`),
      room('im_53', 'Reagent Conduit',
        `Another section of the narrow conduit, its crystallized walls pulsing with the same deep rhythm as the containment vessel above. The reagent flow has shaped this passage into an almost organic form.`),
    ],

    exits: [
      // === Sewer connection ===
      { fromTag: 'sewer_entrance_menagerie', toTag: 'im_entrance', direction: 'down' },
      { fromTag: 'im_entrance', toTag: 'sewer_entrance_menagerie', direction: 'up' },

      // === Row 1: east-west ===
      { fromTag: 'im_1', toTag: 'im_2', direction: 'east' },
      { fromTag: 'im_2', toTag: 'im_1', direction: 'west' },
      { fromTag: 'im_2', toTag: 'im_3', direction: 'east' },
      { fromTag: 'im_3', toTag: 'im_2', direction: 'west' },
      { fromTag: 'im_3', toTag: 'im_4', direction: 'east' },
      { fromTag: 'im_4', toTag: 'im_3', direction: 'west' },
      { fromTag: 'im_4', toTag: 'im_5', direction: 'east' },
      { fromTag: 'im_5', toTag: 'im_4', direction: 'west' },
      { fromTag: 'im_5', toTag: 'im_6', direction: 'east' },
      { fromTag: 'im_6', toTag: 'im_5', direction: 'west' },
      { fromTag: 'im_6', toTag: 'im_7', direction: 'east' },
      { fromTag: 'im_7', toTag: 'im_6', direction: 'west' },
      { fromTag: 'im_7', toTag: 'im_8', direction: 'east' },
      { fromTag: 'im_8', toTag: 'im_7', direction: 'west' },
      { fromTag: 'im_8', toTag: 'im_9', direction: 'east' },
      { fromTag: 'im_9', toTag: 'im_8', direction: 'west' },

      // === Row 2: east-west ===
      { fromTag: 'im_entrance', toTag: 'im_10', direction: 'east' },
      { fromTag: 'im_10', toTag: 'im_entrance', direction: 'west' },
      { fromTag: 'im_10', toTag: 'im_11', direction: 'east' },
      { fromTag: 'im_11', toTag: 'im_10', direction: 'west' },
      { fromTag: 'im_11', toTag: 'im_12', direction: 'east' },
      { fromTag: 'im_12', toTag: 'im_11', direction: 'west' },
      { fromTag: 'im_12', toTag: 'im_13', direction: 'east' },
      { fromTag: 'im_13', toTag: 'im_12', direction: 'west' },
      { fromTag: 'im_pool_1', toTag: 'im_14', direction: 'east' },
      { fromTag: 'im_14', toTag: 'im_pool_1', direction: 'west' },
      { fromTag: 'im_14', toTag: 'im_15', direction: 'east' },
      { fromTag: 'im_15', toTag: 'im_14', direction: 'west' },
      { fromTag: 'im_15', toTag: 'im_16', direction: 'east' },
      { fromTag: 'im_16', toTag: 'im_15', direction: 'west' },

      // === Row 3: east-west ===
      { fromTag: 'im_17', toTag: 'im_18', direction: 'east' },
      { fromTag: 'im_18', toTag: 'im_17', direction: 'west' },
      { fromTag: 'im_19', toTag: 'im_20', direction: 'east' },
      { fromTag: 'im_20', toTag: 'im_19', direction: 'west' },
      { fromTag: 'im_20', toTag: 'im_21', direction: 'east' },
      { fromTag: 'im_21', toTag: 'im_20', direction: 'west' },
      { fromTag: 'im_22', toTag: 'im_23', direction: 'east' },
      { fromTag: 'im_23', toTag: 'im_22', direction: 'west' },
      { fromTag: 'im_23', toTag: 'im_24', direction: 'east' },
      { fromTag: 'im_24', toTag: 'im_23', direction: 'west' },
      { fromTag: 'im_24', toTag: 'im_25', direction: 'east' },
      { fromTag: 'im_25', toTag: 'im_24', direction: 'west' },

      // === Row 4: east-west ===
      { fromTag: 'im_pool_2', toTag: 'im_27', direction: 'east' },
      { fromTag: 'im_27', toTag: 'im_pool_2', direction: 'west' },
      { fromTag: 'im_27', toTag: 'im_28', direction: 'east' },
      { fromTag: 'im_28', toTag: 'im_27', direction: 'west' },
      { fromTag: 'im_28', toTag: 'im_29', direction: 'east' },
      { fromTag: 'im_29', toTag: 'im_28', direction: 'west' },
      { fromTag: 'im_29', toTag: 'im_30', direction: 'east' },
      { fromTag: 'im_30', toTag: 'im_29', direction: 'west' },
      { fromTag: 'im_30', toTag: 'im_31', direction: 'east' },
      { fromTag: 'im_31', toTag: 'im_30', direction: 'west' },
      { fromTag: 'im_lab', toTag: 'im_32', direction: 'east' },
      { fromTag: 'im_32', toTag: 'im_lab', direction: 'west' },

      // === Row 5: east-west ===
      { fromTag: 'im_35', toTag: 'im_36', direction: 'east' },
      { fromTag: 'im_36', toTag: 'im_35', direction: 'west' },
      { fromTag: 'im_36', toTag: 'im_37', direction: 'east' },
      { fromTag: 'im_37', toTag: 'im_36', direction: 'west' },
      { fromTag: 'im_37', toTag: 'im_38', direction: 'east' },
      { fromTag: 'im_38', toTag: 'im_37', direction: 'west' },
      { fromTag: 'im_38', toTag: 'im_39', direction: 'east' },
      { fromTag: 'im_39', toTag: 'im_38', direction: 'west' },
      { fromTag: 'im_39', toTag: 'im_40', direction: 'east' },
      { fromTag: 'im_40', toTag: 'im_39', direction: 'west' },
      { fromTag: 'im_40', toTag: 'im_41', direction: 'east' },
      { fromTag: 'im_41', toTag: 'im_40', direction: 'west' },
      { fromTag: 'im_41', toTag: 'im_42', direction: 'east' },
      { fromTag: 'im_42', toTag: 'im_41', direction: 'west' },

      // === Row 6: east-west ===
      { fromTag: 'im_44', toTag: 'im_45', direction: 'east' },
      { fromTag: 'im_45', toTag: 'im_44', direction: 'west' },
      { fromTag: 'im_45', toTag: 'im_46', direction: 'east' },
      { fromTag: 'im_46', toTag: 'im_45', direction: 'west' },
      { fromTag: 'im_47', toTag: 'im_48', direction: 'east' },
      { fromTag: 'im_48', toTag: 'im_47', direction: 'west' },
      { fromTag: 'im_48', toTag: 'im_49', direction: 'east' },
      { fromTag: 'im_49', toTag: 'im_48', direction: 'west' },
      { fromTag: 'im_49', toTag: 'im_50', direction: 'east' },
      { fromTag: 'im_50', toTag: 'im_49', direction: 'west' },
      { fromTag: 'im_50', toTag: 'im_51', direction: 'east' },
      { fromTag: 'im_51', toTag: 'im_50', direction: 'west' },

      // === Row 7: east-west ===
      { fromTag: 'im_52', toTag: 'im_den', direction: 'east' },
      { fromTag: 'im_den', toTag: 'im_52', direction: 'west' },
      { fromTag: 'im_den', toTag: 'im_53', direction: 'east' },
      { fromTag: 'im_53', toTag: 'im_den', direction: 'west' },

      // === Row 0: east-west ===
      { fromTag: 'im_nest_1', toTag: 'im_crystal_1', direction: 'east' },
      { fromTag: 'im_crystal_1', toTag: 'im_nest_1', direction: 'west' },

      // === Row 0 to Row 1: north-south ===
      { fromTag: 'im_nest_1', toTag: 'im_8', direction: 'south' },
      { fromTag: 'im_8', toTag: 'im_nest_1', direction: 'north' },
      { fromTag: 'im_crystal_1', toTag: 'im_9', direction: 'south' },
      { fromTag: 'im_9', toTag: 'im_crystal_1', direction: 'north' },

      // === Row 1 to Row 2: north-south ===
      { fromTag: 'im_1', toTag: 'im_10', direction: 'south' },
      { fromTag: 'im_10', toTag: 'im_1', direction: 'north' },
      { fromTag: 'im_3', toTag: 'im_12', direction: 'south' },
      { fromTag: 'im_12', toTag: 'im_3', direction: 'north' },
      { fromTag: 'im_4', toTag: 'im_13', direction: 'south' },
      { fromTag: 'im_13', toTag: 'im_4', direction: 'north' },
      { fromTag: 'im_6', toTag: 'im_14', direction: 'south' },
      { fromTag: 'im_14', toTag: 'im_6', direction: 'north' },
      { fromTag: 'im_8', toTag: 'im_16', direction: 'south' },
      { fromTag: 'im_16', toTag: 'im_8', direction: 'north' },
      { fromTag: 'im_9', toTag: 'im_nest_2', direction: 'south' },
      { fromTag: 'im_nest_2', toTag: 'im_9', direction: 'north' },

      // === Row 2 to Row 3: north-south ===
      { fromTag: 'im_12', toTag: 'im_18', direction: 'south' },
      { fromTag: 'im_18', toTag: 'im_12', direction: 'north' },
      { fromTag: 'im_13', toTag: 'im_19', direction: 'south' },
      { fromTag: 'im_19', toTag: 'im_13', direction: 'north' },
      { fromTag: 'im_14', toTag: 'im_21', direction: 'south' },
      { fromTag: 'im_21', toTag: 'im_14', direction: 'north' },
      { fromTag: 'im_15', toTag: 'im_cavern', direction: 'south' },
      { fromTag: 'im_cavern', toTag: 'im_15', direction: 'north' },
      { fromTag: 'im_nest_2', toTag: 'im_23', direction: 'south' },
      { fromTag: 'im_23', toTag: 'im_nest_2', direction: 'north' },

      // === Row 3 to Row 4: north-south ===
      { fromTag: 'im_17', toTag: 'im_26', direction: 'south' },
      { fromTag: 'im_26', toTag: 'im_17', direction: 'north' },
      { fromTag: 'im_19', toTag: 'im_27', direction: 'south' },
      { fromTag: 'im_27', toTag: 'im_19', direction: 'north' },
      { fromTag: 'im_21', toTag: 'im_29', direction: 'south' },
      { fromTag: 'im_29', toTag: 'im_21', direction: 'north' },
      { fromTag: 'im_22', toTag: 'im_31', direction: 'south' },
      { fromTag: 'im_31', toTag: 'im_22', direction: 'north' },
      { fromTag: 'im_24', toTag: 'im_32', direction: 'south' },
      { fromTag: 'im_32', toTag: 'im_24', direction: 'north' },
      { fromTag: 'im_25', toTag: 'im_33', direction: 'south' },
      { fromTag: 'im_33', toTag: 'im_25', direction: 'north' },

      // === Row 4 to Row 5: north-south ===
      { fromTag: 'im_26', toTag: 'im_34', direction: 'south' },
      { fromTag: 'im_34', toTag: 'im_26', direction: 'north' },
      { fromTag: 'im_27', toTag: 'im_36', direction: 'south' },
      { fromTag: 'im_36', toTag: 'im_27', direction: 'north' },
      { fromTag: 'im_29', toTag: 'im_38', direction: 'south' },
      { fromTag: 'im_38', toTag: 'im_29', direction: 'north' },
      { fromTag: 'im_31', toTag: 'im_40', direction: 'south' },
      { fromTag: 'im_40', toTag: 'im_31', direction: 'north' },
      { fromTag: 'im_32', toTag: 'im_42', direction: 'south' },
      { fromTag: 'im_42', toTag: 'im_32', direction: 'north' },
      { fromTag: 'im_33', toTag: 'im_43', direction: 'south' },
      { fromTag: 'im_43', toTag: 'im_33', direction: 'north' },

      // === Row 5 to Row 6: north-south ===
      { fromTag: 'im_34', toTag: 'im_44', direction: 'south' },
      { fromTag: 'im_44', toTag: 'im_34', direction: 'north' },
      { fromTag: 'im_35', toTag: 'im_45', direction: 'south' },
      { fromTag: 'im_45', toTag: 'im_35', direction: 'north' },
      { fromTag: 'im_37', toTag: 'im_crystal_2', direction: 'south' },
      { fromTag: 'im_crystal_2', toTag: 'im_37', direction: 'north' },
      { fromTag: 'im_38', toTag: 'im_vessel', direction: 'south' },
      { fromTag: 'im_vessel', toTag: 'im_38', direction: 'north' },
      { fromTag: 'im_40', toTag: 'im_48', direction: 'south' },
      { fromTag: 'im_48', toTag: 'im_40', direction: 'north' },
      { fromTag: 'im_43', toTag: 'im_51', direction: 'south' },
      { fromTag: 'im_51', toTag: 'im_43', direction: 'north' },

      // === Row 6 to Row 7: north-south ===
      { fromTag: 'im_crystal_2', toTag: 'im_52', direction: 'south' },
      { fromTag: 'im_52', toTag: 'im_crystal_2', direction: 'north' },
      { fromTag: 'im_47', toTag: 'im_53', direction: 'south' },
      { fromTag: 'im_53', toTag: 'im_47', direction: 'north' },
    ],

    doors: [],
  };
}
