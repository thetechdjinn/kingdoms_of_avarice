/**
 * The Thieves Guild — 7 rooms.
 * Hidden underground headquarters beneath the sewer level.
 * Accessed via triggered passageway from sewer_entrance_tg.
 *
 * Trigger: "honest men knock" (one-way, from sewer into guild).
 * Return: normal exit north from tg_entry back to sewer_entrance_tg.
 *
 * Layout: See areas/thieves_guild/plan.md for the canonical ASCII map.
 *
 *       [EN]      S   O
 *         |       |   ‖ (locked door)
 *         *---F---P---G
 *                 |
 *                 M
 *
 * Tag assignments:
 *   tg_entry     = Entry Shaft (*)
 *   tg_foyer     = The Foyer (F)
 *   tg_hallway   = Guild Hallway (P)
 *   tg_hollow    = The Hollow (G)
 *   tg_storage   = Dusty Storeroom (S)
 *   tg_merchant  = Merchant's Alcove (M)
 *   tg_office    = Guild Master's Office (O)
 */
import { DistrictData } from '../arindale/types.js';

const AREA = 'The Thieves Guild';
const TERRAIN = 'underground';

function room(tag: string, name: string, description: string) {
  return { tag, name, description, area: AREA, terrain: TERRAIN, darkness_level: -120 };
}

export function getThievesGuild(): DistrictData {
  return {
    rooms: [
      room('tg_entry', 'Entry Shaft',
        `A narrow vertical shaft carved from raw stone, with iron rungs hammered into the wall forming a crude ladder. The air changes here — the sewer stench fades, replaced by something drier, cleaner. Lamp oil and stone dust. The shaft descends from a cracked conduit above, its opening barely visible in the darkness overhead. Below, the space opens into carved passages that bear no resemblance to the decaying sewer infrastructure above. Someone built this. Someone maintains it.`),

      room('tg_foyer', 'The Foyer',
        `The first proper room beyond the entry shaft. Heavy timber beams brace the ceiling, and iron lanterns throw warm light across stone walls that have been chiseled smooth. A thick wooden door behind you can be barred from this side — a last defense if the entrance is compromised. The floor is swept clean, and weapon racks line one wall. This is a guard post, staffed and ready. The air smells of lamp oil and leather.`),

      room('tg_hallway', 'Guild Hallway',
        `A four-way junction where the guild's main passages converge. The stonework here is deliberate and precise — not sewer construction but proper masonry, fitted blocks with narrow mortar lines. Iron sconces hold oil lanterns at regular intervals, casting steady light without flicker. Carved into the lintel above the eastern passage is a crude symbol — a hand holding a coin. The passage feels lived-in: boot scuffs on the floor, the faint smell of cooking from somewhere nearby.`),

      room('tg_hollow', 'The Hollow',
        `The guild's common room — a vaulted chamber hollowed from the bedrock, larger than anything else down here. Rough-hewn tables and mismatched chairs fill the space, illuminated by stolen candelabras bolted to the walls. A barrel of cheap wine sits in one corner with a tin cup chained to it. Dice and playing cards are scattered across the nearest table. The walls are decorated with trophies — a city guard's helmet, a merchant's ledger nailed open to a page of losses, a noblewoman's silk scarf pinned like a flag. This is where the guild lives when it isn't working.`),

      room('tg_storage', 'Dusty Storeroom',
        `Crates and barrels are stacked floor to ceiling along every wall, leaving only a narrow path through the center. The contents are stamped with merchant marks from a dozen different companies — all stolen, all carefully organized. Bolts of cloth, sealed jars of preserves, coils of rope, tools, and less identifiable goods packed in straw fill the shelves. A ledger hanging from a nail by the door tracks inventory in a cramped, coded hand. The guild's supply line, hidden in plain sight beneath the city.`),

      room('tg_merchant', "Merchant's Alcove",
        `A carved-out niche in the passage wall, fitted with a heavy wooden counter and iron-barred display cases bolted to the stone behind it. The cases hold lockpicks of varying quality, vials of dark liquid, thin-bladed knives, and other tools of the trade — each item tagged with a price in the guild's own shorthand. A set of scales sits on the counter beside a strongbox. The merchant who operates here deals in what the surface shops won't touch: stolen goods, contraband, and the specialized equipment of the professional thief.`),

      room('tg_office', "Guild Master's Office",
        `A private chamber behind a locked door, spartan but purposeful. A heavy desk dominates the room, its surface covered in maps of Arindale's streets and buildings — sewer access points circled in red ink, guard patrol routes traced in blue. Ledgers are stacked in a locked iron cabinet against one wall. A single comfortable chair sits behind the desk, and two plain stools face it. The room smells of sealing wax and ink. Whoever works here runs an operation, not a gang — every detail planned, every risk calculated. A locked strongbox sits beneath the desk, bolted to the floor.`),
    ],

    exits: [
      // === Sewer connection ===
      { fromTag: 'sewer_entrance_tg', toTag: 'tg_entry', direction: 'south' },
      { fromTag: 'tg_entry', toTag: 'sewer_entrance_tg', direction: 'north' },

      // === Entry shaft east to foyer ===
      { fromTag: 'tg_entry', toTag: 'tg_foyer', direction: 'east' },
      { fromTag: 'tg_foyer', toTag: 'tg_entry', direction: 'west' },

      // === Foyer east to hallway ===
      { fromTag: 'tg_foyer', toTag: 'tg_hallway', direction: 'east' },
      { fromTag: 'tg_hallway', toTag: 'tg_foyer', direction: 'west' },

      // === Hallway east to The Hollow ===
      { fromTag: 'tg_hallway', toTag: 'tg_hollow', direction: 'east' },
      { fromTag: 'tg_hollow', toTag: 'tg_hallway', direction: 'west' },

      // === Hallway north to storage ===
      { fromTag: 'tg_hallway', toTag: 'tg_storage', direction: 'north' },
      { fromTag: 'tg_storage', toTag: 'tg_hallway', direction: 'south' },

      // === Hallway south to merchant ===
      { fromTag: 'tg_hallway', toTag: 'tg_merchant', direction: 'south' },
      { fromTag: 'tg_merchant', toTag: 'tg_hallway', direction: 'north' },

      // === The Hollow north to Guild Master's Office (locked door) ===
      { fromTag: 'tg_hollow', toTag: 'tg_office', direction: 'north' },
      { fromTag: 'tg_office', toTag: 'tg_hollow', direction: 'south' },
    ],

    doors: [
      // === One-way triggered passageway from sewer into guild ===
      {
        name: 'conduit entrance',
        doorType: 'triggered_passageway',
        entryTag: 'sewer_entrance_tg',
        entryDirection: 'south',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'honest men knock',
        passageMessageSelf: 'You whisper the secret phrase. A hollow click echoes from behind a large pipe and the pipe shifts exposing a small entrance that you slip through.',
        passageMessageRoom: '{player} whispers something near the broken conduit and slips into the darkness.',
      },
      // === Locked door to Guild Master's Office ===
      {
        name: "guild master's door",
        doorType: 'physical',
        entryTag: 'tg_hollow',
        entryDirection: 'north',
        exitTag: 'tg_office',
        exitDirection: 'south',
        defaultState: 'locked',
        autoResetSeconds: 300,
        hasLock: true,
        pickDifficultyMin: 100,
        pickDifficultyMax: 150,
        bashDifficulty: 200,
        denialMessage: 'The heavy door is locked. A sturdy iron lock holds it shut.',
      },
    ],
  };
}
