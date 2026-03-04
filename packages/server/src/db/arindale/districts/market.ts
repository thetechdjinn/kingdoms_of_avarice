/**
 * Market District — ~15 building rooms.
 * Located around Town Square, primarily south and west.
 * Shops accessed from streets near the square.
 */
import { DistrictData } from '../types.js';

export function getMarketDistrict(): DistrictData {
  return {
    rooms: [
      // Bank — off Cloister Court near Market Street intersection
      {
        tag: 'market_bank',
        name: 'Bank of Arindale',
        description: `Polished marble counters line the walls of this hushed interior. An iron-barred cage separates the tellers from the public floor. Heavy ledgers lie open behind the bars, and the faint scratch of quill on parchment fills the silence.`,
        features: { bank: { enabled: true } },
      },

      // Bladed Weapons
      {
        tag: 'market_blades',
        name: 'Bladed Weapons Shop',
        description: `Swords, daggers, and axes hang from wall-mounted racks, their edges gleaming in the lamplight. A whetstone sits on the counter beside a jar of polishing oil. The shop smells of steel and leather.`,
      },

      // Blunt Weapons
      {
        tag: 'market_blunts',
        name: 'Blunt Weapons Shop',
        description: `Maces, hammers, and staves fill the racks in this sturdy shop. A dented practice dummy stands in the corner, its surface battered almost beyond recognition. Iron-bound displays hold the heavier pieces.`,
      },

      // Armorer — 3 rooms
      {
        tag: 'market_armorer_main',
        name: "Armorer's Shop",
        description: `Heat radiates from a forge at the back of this crowded shop. Breastplates and chain hauberks hang from ceiling hooks, clanking softly when the door swings. The armorer hammers a dent from a battered pauldron.`,
      },
      {
        tag: 'market_armorer_legs',
        name: "Armorer's Shop — Greaves and Boots",
        description: `Shelves of greaves, sabatons, and heavy boots line the walls of this back room. A fitting bench sits in the center with leather straps for adjustments. The clang of the forge echoes from the front.`,
      },
      {
        tag: 'market_armorer_helms',
        name: "Armorer's Shop — Helms and Shields",
        description: `Helms of every shape rest on wooden forms along the shelves — open-faced sallets, full greathelms, and light skullcaps. Shields lean against the far wall, bearing the dents and scratches of past owners.`,
      },

      // Leather Merchant — 2 rooms
      {
        tag: 'market_leather_main',
        name: "Leather Merchant",
        description: `The rich smell of tanned hide fills this shop. Leather tunics, jerkins, and vests hang from pegs along the walls. Rolls of cured leather sit on shelves behind the counter.`,
      },
      {
        tag: 'market_leather_back',
        name: "Leather Merchant — Leggings and Boots",
        description: `Leather leggings in various sizes hang from hooks on a back wall. A cobbler's bench sits beneath the window, surrounded by awls, needles, and spools of waxed thread. Sturdy boots line the floor.`,
      },

      // Clothier
      {
        tag: 'market_clothier',
        name: "Clothier's Shop",
        description: `Bolts of cloth in muted earth tones fill the shelves of this tidy shop. Robes, cloaks, and traveling garments hang from a rack near the door. A measuring cord dangles from a hook on the wall.`,
      },

      // General Store
      {
        tag: 'market_general',
        name: 'General Store',
        description: `Barrels, crates, and baskets crowd the floor of this cluttered shop. Torches, rope, rations, waterskins, and a hundred other necessities are stacked on shelves that reach the ceiling.`,
      },

      // Curio Shop
      {
        tag: 'market_curios',
        name: 'Curio Shop',
        description: `Odd trinkets and peculiar artifacts crowd every surface in this dim, cramped shop. A stuffed owl watches from a high shelf. Scrolls, charms, and items of dubious provenance fill glass-topped cases.`,
      },

      // Jeweler
      {
        tag: 'market_jeweler',
        name: "Jeweler's Shop",
        description: `Velvet-lined cases display rings, amulets, and necklaces under the soft glow of enchanted crystal lamps. The shopkeeper examines a gemstone through a jeweler's loupe, barely glancing up.`,
      },

      // Mage Spell Shop
      {
        tag: 'market_mage_spells',
        name: 'Arcane Scroll Emporium',
        description: `Shelves of scrolls and grimoires line the walls from floor to ceiling, their bindings cracked and worn. A faint hum of residual magic makes the air tingle. The shopkeeper traces a rune in the air, testing a ward.`,
      },

      // Alchemist
      {
        tag: 'market_alchemist',
        name: "Alchemist's Shop",
        description: `Glass vials and ceramic jars crowd the shelves, each bearing a handwritten label. Bubbling flasks sit on a workbench beside a mortar and pestle stained with colorful residue. The air smells of herbs and something faintly acidic.`,
      },

      // Stable
      {
        tag: 'market_stable',
        name: 'City Stable',
        description: `Straw-covered floors and the warm smell of horses fill this large stable. Stalls line both walls, some occupied by patient draft horses, others empty and freshly mucked. A groom hauls a bucket of oats from the feed room.`,
      },
    ],

    exits: [
      // Bank — 1 south of Town Square on King's Rd, entrance west
      { fromTag: 'ns_2_2_1', toTag: 'market_bank', direction: 'west' },
      { fromTag: 'market_bank', toTag: 'ns_2_2_1', direction: 'east' },

      // Bladed Weapons — 2 north of Town Square on King's Rd, entrance west
      { fromTag: 'ns_2_1_2', toTag: 'market_blades', direction: 'west' },
      { fromTag: 'market_blades', toTag: 'ns_2_1_2', direction: 'east' },

      // Blunt Weapons — 3 north of Town Square on King's Rd, entrance west
      { fromTag: 'ns_2_1_1', toTag: 'market_blunts', direction: 'west' },
      { fromTag: 'market_blunts', toTag: 'ns_2_1_1', direction: 'east' },

      // Armorer — 1 north of Town Square, two entrances (King's Rd west, Main St north)
      // Main(7,7) → west → Legs(6,7) → north → Helms(6,6)
      { fromTag: 'ns_2_1_3', toTag: 'market_armorer_main', direction: 'west' },
      { fromTag: 'market_armorer_main', toTag: 'ns_2_1_3', direction: 'east' },
      { fromTag: 'ew_2_1_3', toTag: 'market_armorer_main', direction: 'north' },
      { fromTag: 'market_armorer_main', toTag: 'ew_2_1_3', direction: 'south' },
      { fromTag: 'market_armorer_main', toTag: 'market_armorer_legs', direction: 'west' },
      { fromTag: 'market_armorer_legs', toTag: 'market_armorer_main', direction: 'east' },
      { fromTag: 'market_armorer_legs', toTag: 'market_armorer_helms', direction: 'north' },
      { fromTag: 'market_armorer_helms', toTag: 'market_armorer_legs', direction: 'south' },

      // Clothier — 1 north of Town Square, east. Two entrances (King's Rd + Main St)
      { fromTag: 'ns_2_1_3', toTag: 'market_clothier', direction: 'east' },
      { fromTag: 'market_clothier', toTag: 'ns_2_1_3', direction: 'west' },
      { fromTag: 'ew_2_2_1', toTag: 'market_clothier', direction: 'north' },
      { fromTag: 'market_clothier', toTag: 'ew_2_2_1', direction: 'south' },

      // Leather Merchant — 2 north of Town Square, east. Back room north (no street exit)
      { fromTag: 'ns_2_1_2', toTag: 'market_leather_main', direction: 'east' },
      { fromTag: 'market_leather_main', toTag: 'ns_2_1_2', direction: 'west' },
      { fromTag: 'market_leather_main', toTag: 'market_leather_back', direction: 'east' },
      { fromTag: 'market_leather_back', toTag: 'market_leather_main', direction: 'west' },

      // Curio Shop — 2 east of Town Square on Main St, entrance north
      { fromTag: 'ew_2_2_2', toTag: 'market_curios', direction: 'north' },
      { fromTag: 'market_curios', toTag: 'ew_2_2_2', direction: 'south' },

      // General Store — 2 east of Town Square on Main St, entrance south
      { fromTag: 'ew_2_2_2', toTag: 'market_general', direction: 'south' },
      { fromTag: 'market_general', toTag: 'ew_2_2_2', direction: 'north' },

      // Jeweler — off King's Road, two south of Town Square (ns_2_2_2)
      { fromTag: 'ns_2_2_2', toTag: 'market_jeweler', direction: 'west' },
      { fromTag: 'market_jeweler', toTag: 'ns_2_2_2', direction: 'east' },

      // Mage Spell Shop — off Main Street, two west of Town Square (ew_2_1_2)
      { fromTag: 'ew_2_1_2', toTag: 'market_mage_spells', direction: 'south' },
      { fromTag: 'market_mage_spells', toTag: 'ew_2_1_2', direction: 'north' },

      // Alchemist — 3 west of Town Square on Main St, entrance south (1 west of Mage shop)
      { fromTag: 'ew_2_1_1', toTag: 'market_alchemist', direction: 'south' },
      { fromTag: 'market_alchemist', toTag: 'ew_2_1_1', direction: 'north' },

      // Stable — 3 south of Town Square on King's Rd, entrance east
      { fromTag: 'ns_2_2_3', toTag: 'market_stable', direction: 'east' },
      { fromTag: 'market_stable', toTag: 'ns_2_2_3', direction: 'west' },
    ],
  };
}
