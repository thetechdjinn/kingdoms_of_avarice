/**
 * Cathedral District — 17 building rooms.
 * East of Cathedral Lane, between Main Street and Castle Road.
 * Cathedral, crypt, Halls of the Dead, grounds.
 *
 * Grid validation map (east_offset, south_offset from entry row):
 * Block: Cathedral Ln (col 3) to Eastwall (col 4), Main St (row 2) to Cloister Ct (row 3)
 * Entry at ns_3_2_1 (y=9). Rooms extend south (y+1) into block interior.
 *
 *   Cathedral Ln  1east          2east          3east     Eastwall
 *      (0)                                                  (4)
 *       |                                                    |
 *    0: |    ns_3_2_1 ..............................          |  ← near Main Street
 *       |                                                    |
 *    1: |     Courtyard ------ Entrance ------- Nave         |
 *       |       |                  |           [down] |      |
 *    2: |     Garden           Healer ---------- Sanctum     |
 *       |       |                  |                |        |
 *    3: |     Graveyard        Holy Items --- Divine Spells  |
 *       |                                                    |
 *   Rooms go south from entry row. Crypt is below the Sanctum.
 */
import { DistrictData } from '../types.js';

export function getCathedralDistrict(): DistrictData {
  return {
    rooms: [
      // Cathedral grounds
      {
        tag: 'cathedral_courtyard',
        name: 'Cathedral Courtyard',
        description: `A flagstone courtyard opens before the cathedral's arched entrance. A stone basin of clear water stands at its center, reflecting the stained glass windows above. The bustle of the city feels distant here, muffled by the high walls.`,
      },
      {
        tag: 'cathedral_graveyard',
        name: 'Cathedral Graveyard',
        description: `Weathered headstones stand in uneven rows among patches of overgrown grass. An iron fence separates the graveyard from the lane. Some markers bear fresh flowers; others have sunk into the earth, their inscriptions lost to time.`,
      },
      {
        tag: 'cathedral_garden',
        name: 'Cathedral Garden',
        description: `A walled garden behind the cathedral grows herbs and medicinal plants in neat raised beds. The scent of lavender and rosemary fills the still air. A stone path winds between the beds toward a small wooden gate.`,
      },

      // Cathedral interior
      {
        tag: 'cathedral_entrance',
        name: 'Cathedral Entrance',
        description: `A grand arched doorway opens into the cathedral's vestibule. Stone columns rise on either side, carved with scenes of divine triumph. The air is cool and still, carrying the faint scent of incense and old stone.`,
      },
      {
        tag: 'cathedral_nave',
        name: 'Cathedral Nave',
        description: `The cathedral's main hall soars overhead, its vaulted ceiling lost in shadow. Rows of wooden pews face the distant altar. Stained glass windows cast pools of colored light across the stone floor, shifting slowly with the sun.`,
      },
      {
        tag: 'cathedral_sanctum',
        name: 'Inner Sanctum',
        description: `The innermost chamber of the cathedral is hushed and dim. A marble altar stands beneath a dome painted with celestial figures. Silver candlesticks flank the altar, their flames steady in the still air.`,
      },

      // Cathedral services
      {
        tag: 'cathedral_healer',
        name: 'Priest Healer',
        description: `A small chamber off the inner sanctum serves as the cathedral's healing room. A padded bench sits against one wall, and shelves hold jars of salve and bundles of dried herbs. The faint glow of healing magic lingers in the air.`,
      },
      {
        tag: 'cathedral_divine_spells',
        name: 'Divine Spell Chamber',
        description: `Prayer books and illuminated manuscripts fill the shelves of this quiet chamber. A robed cleric sits at a reading desk, copying sacred texts by candlelight. Scrolls of divine magic are stored in a locked cabinet behind the desk.`,
      },
      {
        tag: 'cathedral_holy_items',
        name: 'Holy Items Repository',
        description: `Glass-fronted cabinets hold blessed items: vials of holy water, prayer beads of polished bone, and silver amulets bearing the marks of protection. A priest tends the displays, polishing each piece with a soft cloth.`,
      },

      // Crypt
      {
        tag: 'cathedral_crypt_stairs',
        name: 'Crypt Stairs',
        description: `Worn stone steps spiral downward into darkness. The air grows cold and still as the stairway descends. Torches in iron brackets light the way at long intervals, their flames barely flickering in the dead air.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_upper',
        name: 'Upper Crypt',
        description: `Stone sarcophagi rest in recessed alcoves along the walls of this underground chamber. The lids are carved with the likenesses of the interred, their hands folded over stone swords. Cobwebs bridge the gaps between the alcoves.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_passage',
        name: 'Crypt Passage',
        description: `A low-ceilinged passage runs between burial chambers. The walls are lined with niches holding dusty urns and faded name plaques. A cold draft stirs the air, carrying the scent of damp stone and old earth.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_chamber',
        name: 'Crypt Chamber',
        description: `A larger chamber opens at the junction of two passages. A cracked stone angel kneels at the center, its wings broken, its face turned upward. The names on the surrounding tombs are too worn to read.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_deep',
        name: 'Deep Crypt',
        description: `The crypt grows darker and colder with each step. The stonework here is older, rougher, predating the cathedral above. A pool of candlewax has hardened on the floor where mourners once knelt.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_alcove',
        name: 'Crypt Alcove',
        description: `A dead-end alcove holds a single ornate sarcophagus of black marble. Gold leaf traces a pattern of vines and thorns across its lid. The air is perfectly still, and the silence is absolute.`,
        terrain: 'underground',
        darkness_level: -120,
      },
      {
        tag: 'cathedral_crypt_descent',
        name: 'Crypt Descent',
        description: `A final set of stairs leads down from the deepest part of the crypt. The steps are carved from living rock, and the walls bear no decoration. A faint, otherworldly glow rises from below.`,
        terrain: 'underground',
        darkness_level: -120,
      },

      // Halls of the Dead — respawn room
      {
        tag: 'cathedral_halls_dead',
        name: 'Halls of the Dead',
        description: `A vast subterranean hall stretches into dimness, its ceiling lost in shadow. Pale light emanates from the stone itself, casting no shadows. The air is neither warm nor cold, and all sound seems muffled, as if the world above has ceased to exist. A narrow stairway carved into the far wall leads back up toward the living city. In the eastern wall, a jagged crack runs from floor to ceiling, barely wide enough to squeeze through but passable.`,
        terrain: 'underground',
        darkness_level: -120,
        features: { respawn: { enabled: true, priority: 0, servedAreas: ['Arindale'] } },
      },
    ],

    exits: [
      // Entry from Cathedral Lane (ns_3_2_1)
      { fromTag: 'ns_3_2_1', toTag: 'cathedral_courtyard', direction: 'east' },
      { fromTag: 'cathedral_courtyard', toTag: 'ns_3_2_1', direction: 'west' },

      // Row y=1: Courtyard → Entrance → Nave (east chain)
      { fromTag: 'cathedral_courtyard', toTag: 'cathedral_entrance', direction: 'east' },
      { fromTag: 'cathedral_entrance', toTag: 'cathedral_courtyard', direction: 'west' },
      { fromTag: 'cathedral_entrance', toTag: 'cathedral_nave', direction: 'east' },
      { fromTag: 'cathedral_nave', toTag: 'cathedral_entrance', direction: 'west' },

      // West column: Courtyard → Garden → Graveyard (grounds, south into block)
      { fromTag: 'cathedral_courtyard', toTag: 'cathedral_garden', direction: 'south' },
      { fromTag: 'cathedral_garden', toTag: 'cathedral_courtyard', direction: 'north' },
      { fromTag: 'cathedral_garden', toTag: 'cathedral_graveyard', direction: 'south' },
      { fromTag: 'cathedral_graveyard', toTag: 'cathedral_garden', direction: 'north' },

      // Center column: Entrance → Healer → Holy Items (south into block)
      { fromTag: 'cathedral_entrance', toTag: 'cathedral_healer', direction: 'south' },
      { fromTag: 'cathedral_healer', toTag: 'cathedral_entrance', direction: 'north' },
      { fromTag: 'cathedral_healer', toTag: 'cathedral_holy_items', direction: 'south' },
      { fromTag: 'cathedral_holy_items', toTag: 'cathedral_healer', direction: 'north' },

      // East column: Nave → Sanctum → Divine Spells (south into block)
      { fromTag: 'cathedral_nave', toTag: 'cathedral_sanctum', direction: 'south' },
      { fromTag: 'cathedral_sanctum', toTag: 'cathedral_nave', direction: 'north' },
      { fromTag: 'cathedral_sanctum', toTag: 'cathedral_divine_spells', direction: 'south' },
      { fromTag: 'cathedral_divine_spells', toTag: 'cathedral_sanctum', direction: 'north' },

      // Cross-links: Sanctum ↔ Healer, Holy Items ↔ Divine Spells
      { fromTag: 'cathedral_sanctum', toTag: 'cathedral_healer', direction: 'west' },
      { fromTag: 'cathedral_healer', toTag: 'cathedral_sanctum', direction: 'east' },
      { fromTag: 'cathedral_holy_items', toTag: 'cathedral_divine_spells', direction: 'east' },
      { fromTag: 'cathedral_divine_spells', toTag: 'cathedral_holy_items', direction: 'west' },

      // Crypt entrance — beneath the sanctum
      { fromTag: 'cathedral_sanctum', toTag: 'cathedral_crypt_stairs', direction: 'down' },
      { fromTag: 'cathedral_crypt_stairs', toTag: 'cathedral_sanctum', direction: 'up' },

      // Crypt chain
      { fromTag: 'cathedral_crypt_stairs', toTag: 'cathedral_crypt_upper', direction: 'down' },
      { fromTag: 'cathedral_crypt_upper', toTag: 'cathedral_crypt_stairs', direction: 'up' },
      { fromTag: 'cathedral_crypt_upper', toTag: 'cathedral_crypt_passage', direction: 'east' },
      { fromTag: 'cathedral_crypt_passage', toTag: 'cathedral_crypt_upper', direction: 'west' },
      { fromTag: 'cathedral_crypt_passage', toTag: 'cathedral_crypt_chamber', direction: 'east' },
      { fromTag: 'cathedral_crypt_chamber', toTag: 'cathedral_crypt_passage', direction: 'west' },
      { fromTag: 'cathedral_crypt_chamber', toTag: 'cathedral_crypt_deep', direction: 'south' },
      { fromTag: 'cathedral_crypt_deep', toTag: 'cathedral_crypt_chamber', direction: 'north' },
      { fromTag: 'cathedral_crypt_deep', toTag: 'cathedral_crypt_alcove', direction: 'west' },
      { fromTag: 'cathedral_crypt_alcove', toTag: 'cathedral_crypt_deep', direction: 'east' },
      { fromTag: 'cathedral_crypt_chamber', toTag: 'cathedral_crypt_descent', direction: 'down' },
      { fromTag: 'cathedral_crypt_descent', toTag: 'cathedral_crypt_chamber', direction: 'up' },

      // Descent → Halls of the Dead
      { fromTag: 'cathedral_crypt_descent', toTag: 'cathedral_halls_dead', direction: 'down' },
      { fromTag: 'cathedral_halls_dead', toTag: 'cathedral_crypt_descent', direction: 'up' },
    ],
  };
}
