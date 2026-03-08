/**
 * Sanctum of the Damned — 59 rooms.
 * Sub-zone branching off the Arindale Sewer north tunnels.
 * Hidden underground shrine of the Disciples of Malachi — a forbidden cult
 * operating in secret beneath Arindale. Converted sewer infrastructure
 * transformed into a dark place of worship.
 *
 * Entered from sewer_entrance_sanctum (north_tunnels.ts) going down/up.
 *
 * Layout: See areas/sanctum_of_the_damned/plan.md for the canonical ASCII map.
 *
 * Map orientation: LEFT = west (toward entrance), RIGHT = east (deeper).
 * UP = north, DOWN = south (standard).
 *
 * Zone assignments for descriptions:
 *   Outer (*, T, G, S): Converted sewer perimeter, guard posts, storage
 *   Mid (H, h, Q, M): Cult living space, hallways, quarters
 *   Inner (A, P, L, O, q): Ritual territory, leadership rooms
 *   Core (R): Reliquary of the Obsidian Sun — hand-written only
 *
 * Tag assignments by room type:
 *   sd_entrance              [EN] Sanctum Entrance
 *   sd_1..sd_17              *   Standard rooms (converted sewer)
 *   sd_guard_3               G   Guard Post (main junction only)
 *   sd_storage_1..3          S   Storage Chamber
 *   sd_threshold_1..3        T   Darkened Threshold
 *   sd_hallway_1..20         H   Cult Hallway
 *   sd_qhall_1..3            h   Quarters Corridor
 *   sd_quarters_1..3         Q   Cultist Quarters
 *   sd_altar_1..2            A   Altar Room
 *   sd_meeting               M   Meeting Hall
 *   sd_prep                  P   Preparation Chamber
 *   sd_scriptorium           L   Scriptorium
 *   sd_office                O   Cult Leader's Office
 *   sd_leader_quarters       q   Cult Leader's Quarters
 *   sd_reliquary             R   Reliquary of the Obsidian Sun
 */
import { DistrictData } from '../arindale/types.js';
import {
  sanctumDescription,
  sanctumRoomName,
  maybeAddSanctumDetail,
  type DetailZone,
} from './descriptions.js';

const AREA = 'Sanctum of the Damned';
const TERRAIN = 'underground';

function stdDesc(tag: string, zone: DetailZone): string {
  return maybeAddSanctumDetail(sanctumDescription('standard', tag), tag, zone);
}

function hallDesc(tag: string, zone: DetailZone): string {
  return maybeAddSanctumDetail(sanctumDescription('hallway', tag), tag, zone);
}

function room(tag: string, name: string, description: string) {
  return { tag, name, description, area: AREA, terrain: TERRAIN };
}

export function getSanctumOfTheDamned(): DistrictData {
  return {
    rooms: [
      // === Row 0 (3 rooms): Q Q Q ===
      room('sd_quarters_1', 'Cultist Quarters',
        `A small sleeping chamber behind an unlocked door. A narrow cot is pushed against one wall, a rough blanket folded at its foot. A wooden peg holds a dark robe. Personal effects are sparse — a clay cup, a worn prayer book, a stub of black candle. The room smells of stale incense and unwashed cloth.`),
      room('sd_quarters_2', 'Cultist Quarters',
        `A cramped sleeping cell barely large enough for the cot and small chest it contains. Dark robes hang from a hook on the wall. A half-eaten meal sits on the chest — bread and dried meat. Chalk symbols have been drawn on the wall above the cot, personal devotions to whatever the cult worships.`),
      room('sd_quarters_3', 'Cultist Quarters',
        `The smallest of the sleeping chambers, its door hanging slightly ajar. The cot here is unmade, blankets tangled. A leather satchel lies open on the floor, its contents scattered — a knife, bandages, a small pouch of coins. Whoever sleeps here left in a hurry.`),

      // === Row A (9 rooms): S S G H H H h h h ===
      room('sd_storage_1', 'Storage Chamber',
        `A side room converted for storage. Wooden crates stamped with Arindale merchant marks are stacked against the walls — stolen goods, by the look of them. Sacks of grain lean in one corner. The room is dry and surprisingly well-organized, everything arranged with military precision.`),
      room('sd_storage_2', 'Storage Chamber',
        `A supply room crammed with the necessities of underground living. Barrels of water, bundles of torches, coils of rope, and boxes of dark candles fill the space. A rack along one wall holds clay jars sealed with wax — preserved food, perhaps, or ritual materials. The air is close and smells of tallow.`),
      room('sd_hallway_19', 'Cult Hallway', hallDesc('sd_hallway_19', 'outer')),
      room('sd_hallway_1', 'Cult Hallway', hallDesc('sd_hallway_1', 'outer')),
      room('sd_hallway_2', 'Cult Hallway', hallDesc('sd_hallway_2', 'outer')),
      room('sd_hallway_3', 'Cult Hallway', hallDesc('sd_hallway_3', 'outer')),
      room('sd_qhall_1', 'Quarters Corridor',
        `A short corridor with doors branching off to individual sleeping chambers. Dark robes hang from wooden pegs between the doorways. The floor is covered with thin rush matting. The air smells of bodies and incense — the smell of people living in close quarters underground.`),
      room('sd_qhall_2', 'Quarters Corridor',
        `The quarters hallway continues, more doors leading to individual cells. A small table against the wall holds a clay water pitcher and a stack of wooden bowls. The candlelight here is dimmer, the candles older. Boot prints mark the rush matting.`),
      room('sd_qhall_3', 'Quarters Corridor',
        `The end of the quarters corridor. A final door leads to a sleeping chamber. The wall here bears a large painted symbol — a circle with radiating lines, rendered in dark paint that catches the candlelight. Below it, someone has placed a small offering: a black candle, a coin, a dried flower.`),

      // === Row B (10 rooms): * * * * G A H H H M ===
      room('sd_1', sanctumRoomName('sd_1'), stdDesc('sd_1', 'outer')),
      room('sd_2', sanctumRoomName('sd_2'), stdDesc('sd_2', 'outer')),
      room('sd_3', sanctumRoomName('sd_3'), stdDesc('sd_3', 'outer')),
      room('sd_4', sanctumRoomName('sd_4'), stdDesc('sd_4', 'outer')),
      room('sd_hallway_20', 'Cult Hallway', hallDesc('sd_hallway_20', 'outer')),
      room('sd_altar_1', 'Altar Room',
        `A small chamber set aside for ritual use. A stone slab dominates the center, its surface stained dark with substances best not examined. Black candles arranged in geometric patterns surround the slab. The air is thick with old incense. Angular symbols cover every wall, layered deep.`),
      room('sd_hallway_4', 'Cult Hallway', hallDesc('sd_hallway_4', 'outer')),
      room('sd_hallway_5', 'Cult Hallway', hallDesc('sd_hallway_5', 'outer')),
      room('sd_hallway_6', 'Cult Hallway', hallDesc('sd_hallway_6', 'outer')),
      room('sd_meeting', 'Meeting Hall',
        `A large chamber dominated by a long wooden table surrounded by rough-hewn chairs. Maps and documents are spread across the table's surface — plans, lists of names, schedules. The walls are draped in black cloth bearing the cult's angular symbols. Iron chandeliers hold clusters of dark candles. This is where the cult's leadership makes decisions.`),

      // === Row C (11 rooms): [EN] * T T G H H H H * * ===
      room('sd_entrance', 'Sanctum Entrance',
        `The transition from sewer to something else. The filth and disorder of the tunnels gives way to swept stone and deliberate order. The walls have been cleaned, the floor leveled. A shaft leads up to the sewer passage above. To the east, the tunnel continues, and the faintest scent of incense mixes with the damp air. This is a threshold — beyond it, someone has claimed the darkness for their own purposes.`),
      room('sd_5', sanctumRoomName('sd_5'), stdDesc('sd_5', 'outer')),
      room('sd_threshold_1', 'Darkened Threshold',
        `The tunnel changes character here. The swept stone of the approach gives way to something more deliberate — the walls are darker, treated with some substance that absorbs light. The first sconces appear, iron brackets bolted to the stone, though the candles they hold are unlit. The smell of incense is stronger.`),
      room('sd_threshold_2', 'Darkened Threshold',
        `The transition deepens. Black cloth begins to appear on the walls — not the full draping of the inner sanctum, but patches and panels, test hangings. A carved symbol on the bare stone marks the edge of consecrated ground. The candles in the sconces here are dark and half-burned.`),
      room('sd_guard_3', 'Guard Post',
        `The primary guard station on the main corridor. The passage narrows through a constructed chokepoint of fitted stone blocks, creating a defensible position. Weapon racks line the walls — clubs, short swords, crossbow bolts. This is where the cult's security is thickest. Beyond this point, the sanctum begins in earnest.`),
      room('sd_hallway_7', 'Cult Hallway', hallDesc('sd_hallway_7', 'outer')),
      room('sd_hallway_8', 'Cult Hallway', hallDesc('sd_hallway_8', 'outer')),
      room('sd_hallway_9', 'Cult Hallway', hallDesc('sd_hallway_9', 'outer')),
      room('sd_hallway_10', 'Cult Hallway', hallDesc('sd_hallway_10', 'outer')),
      room('sd_6', sanctumRoomName('sd_6'), stdDesc('sd_6', 'outer')),
      room('sd_7', sanctumRoomName('sd_7'), stdDesc('sd_7', 'outer')),

      // === Row D (7 rooms): T S H H H * * ===
      room('sd_threshold_3', 'Darkened Threshold',
        `The final threshold before the sanctum's deeper reaches. The walls are fully draped in black cloth here, the sconces lit with dark candles. The carved symbols on the stone behind the cloth are larger, more complex. The incense smell is almost overpowering. Below this point, the cult's grip on the architecture is total.`),
      room('sd_storage_3', 'Storage Chamber',
        `A deeper storage room containing ritual materials rather than mundane supplies. Shelves hold rows of dark candles, ceramic incense burners, sealed clay jars of oils and unguents. Bolts of black cloth are stacked in one corner. A locked chest sits against the far wall, its contents unknown.`),
      room('sd_hallway_11', 'Cult Hallway', hallDesc('sd_hallway_11', 'inner')),
      room('sd_hallway_12', 'Cult Hallway', hallDesc('sd_hallway_12', 'inner')),
      room('sd_hallway_13', 'Cult Hallway', hallDesc('sd_hallway_13', 'inner')),
      room('sd_8', sanctumRoomName('sd_8'), stdDesc('sd_8', 'inner')),
      room('sd_9', sanctumRoomName('sd_9'), stdDesc('sd_9', 'inner')),

      // === Row E (7 rooms): * * H A H O * ===
      room('sd_10', sanctumRoomName('sd_10'), stdDesc('sd_10', 'inner')),
      room('sd_11', sanctumRoomName('sd_11'), stdDesc('sd_11', 'inner')),
      room('sd_hallway_14', 'Cult Hallway', hallDesc('sd_hallway_14', 'inner')),
      room('sd_altar_2', 'Altar Room',
        `A second ritual chamber, larger and more elaborately decorated than the first. The stone altar here is carved with deep channels that lead to a basin set into the floor. The walls are covered in layered symbols — older marks beneath newer ones, decades of devotion. The dark candles here burn with an unusual steadiness, their flames perfectly still in the motionless air.`),
      room('sd_hallway_15', 'Cult Hallway', hallDesc('sd_hallway_15', 'inner')),
      room('sd_office', "Cult Leader's Office",
        `A private chamber that speaks of authority and obsession. A heavy wooden desk dominates one wall, covered in documents — correspondence in code, lists of names, maps of the city above with locations marked. Bookshelves hold forbidden texts bound in dark leather. The walls are hung with finer cloth than the corridors, and the incense here is richer, more complex. A locked door leads south to the leader's personal quarters.`),
      room('sd_12', sanctumRoomName('sd_12'), stdDesc('sd_12', 'inner')),

      // === Row F (7 rooms): * * H H H q R ===
      room('sd_13', sanctumRoomName('sd_13'), stdDesc('sd_13', 'inner')),
      room('sd_14', sanctumRoomName('sd_14'), stdDesc('sd_14', 'inner')),
      room('sd_hallway_16', 'Cult Hallway', hallDesc('sd_hallway_16', 'inner')),
      room('sd_hallway_17', 'Cult Hallway', hallDesc('sd_hallway_17', 'inner')),
      room('sd_hallway_18', 'Cult Hallway', hallDesc('sd_hallway_18', 'inner')),
      room('sd_leader_quarters', "Cult Leader's Quarters",
        `More comfortable than the common sleeping cells, but still austere. A wider cot with actual bedding, a small writing table, a chest of personal belongings. Dark robes of finer material hang from a wooden stand. A mirror — rare underground — is mounted on one wall. The room smells of the same rich incense as the office above. A personal altar sits in one corner, smaller and more intimate than the communal ones.`),
      room('sd_reliquary', 'Reliquary of the Obsidian Sun',
        `The innermost shrine of the Disciples of Malachi. The chamber is circular, its walls carved from living rock and draped in the finest black cloth. At the center, on a raised stone pedestal, rests the Obsidian Sun — a disc of black stone that seems to drink in the light. Dark candles ring the pedestal in concentric circles, their flames bending inward toward the relic. The air here is heavy with a presence that has nothing to do with incense or atmosphere. Something is here. Something that watches.`),

      // === Row G (5 rooms): * * * L P ===
      room('sd_15', sanctumRoomName('sd_15'), stdDesc('sd_15', 'inner')),
      room('sd_16', sanctumRoomName('sd_16'), stdDesc('sd_16', 'inner')),
      room('sd_17', sanctumRoomName('sd_17'), stdDesc('sd_17', 'inner')),
      room('sd_scriptorium', 'Scriptorium',
        `A room dedicated to the written word — or at least, to the cult's version of it. Shelves line every wall, filled with hand-copied texts, scrolls, and bound manuscripts. A long writing desk holds quills, ink, and partially completed pages. The texts are a mix of religious instruction, copied scripture, and meticulous records of cult activities — members, meetings, rituals performed. Some of the older texts are in a language that is not quite recognizable.`),
      room('sd_prep', 'Preparation Chamber',
        `Where cultists prepare for ritual. A long bench holds neatly arranged implements — ceremonial blades, bowls of dark paint for marking skin, bundles of incense, and folded ritual robes. A basin of water sits in one corner for cleansing. The walls are marked with step-by-step instructions for ritual preparation, painted in careful script. The room has the clinical feel of a sacristy, if the sacristy served something dark.`),
    ],

    exits: [
      // === Sewer connection (down/up) ===
      { fromTag: 'sewer_entrance_sanctum', toTag: 'sd_entrance', direction: 'down' },
      { fromTag: 'sd_entrance', toTag: 'sewer_entrance_sanctum', direction: 'up' },

      // === Row A: east-west ===
      { fromTag: 'sd_hallway_19', toTag: 'sd_hallway_1', direction: 'east' },
      { fromTag: 'sd_hallway_1', toTag: 'sd_hallway_19', direction: 'west' },
      { fromTag: 'sd_hallway_1', toTag: 'sd_hallway_2', direction: 'east' },
      { fromTag: 'sd_hallway_2', toTag: 'sd_hallway_1', direction: 'west' },
      { fromTag: 'sd_hallway_2', toTag: 'sd_hallway_3', direction: 'east' },
      { fromTag: 'sd_hallway_3', toTag: 'sd_hallway_2', direction: 'west' },
      { fromTag: 'sd_hallway_3', toTag: 'sd_qhall_1', direction: 'east' },
      { fromTag: 'sd_qhall_1', toTag: 'sd_hallway_3', direction: 'west' },
      { fromTag: 'sd_qhall_1', toTag: 'sd_qhall_2', direction: 'east' },
      { fromTag: 'sd_qhall_2', toTag: 'sd_qhall_1', direction: 'west' },
      { fromTag: 'sd_qhall_2', toTag: 'sd_qhall_3', direction: 'east' },
      { fromTag: 'sd_qhall_3', toTag: 'sd_qhall_2', direction: 'west' },

      // === Row B: east-west ===
      { fromTag: 'sd_1', toTag: 'sd_2', direction: 'east' },
      { fromTag: 'sd_2', toTag: 'sd_1', direction: 'west' },
      { fromTag: 'sd_2', toTag: 'sd_3', direction: 'east' },
      { fromTag: 'sd_3', toTag: 'sd_2', direction: 'west' },
      { fromTag: 'sd_3', toTag: 'sd_4', direction: 'east' },
      { fromTag: 'sd_4', toTag: 'sd_3', direction: 'west' },
      // G(19) is isolated east-west; A(23) starts a new chain
      { fromTag: 'sd_altar_1', toTag: 'sd_hallway_4', direction: 'east' },
      { fromTag: 'sd_hallway_4', toTag: 'sd_altar_1', direction: 'west' },
      { fromTag: 'sd_hallway_4', toTag: 'sd_hallway_5', direction: 'east' },
      { fromTag: 'sd_hallway_5', toTag: 'sd_hallway_4', direction: 'west' },
      { fromTag: 'sd_hallway_5', toTag: 'sd_hallway_6', direction: 'east' },
      { fromTag: 'sd_hallway_6', toTag: 'sd_hallway_5', direction: 'west' },
      { fromTag: 'sd_hallway_6', toTag: 'sd_meeting', direction: 'east' },
      { fromTag: 'sd_meeting', toTag: 'sd_hallway_6', direction: 'west' },

      // === Row C: east-west ===
      { fromTag: 'sd_entrance', toTag: 'sd_5', direction: 'east' },
      { fromTag: 'sd_5', toTag: 'sd_entrance', direction: 'west' },
      { fromTag: 'sd_5', toTag: 'sd_threshold_1', direction: 'east' },
      { fromTag: 'sd_threshold_1', toTag: 'sd_5', direction: 'west' },
      { fromTag: 'sd_threshold_1', toTag: 'sd_threshold_2', direction: 'east' },
      { fromTag: 'sd_threshold_2', toTag: 'sd_threshold_1', direction: 'west' },
      { fromTag: 'sd_threshold_2', toTag: 'sd_guard_3', direction: 'east' },
      { fromTag: 'sd_guard_3', toTag: 'sd_threshold_2', direction: 'west' },
      { fromTag: 'sd_guard_3', toTag: 'sd_hallway_7', direction: 'east' },
      { fromTag: 'sd_hallway_7', toTag: 'sd_guard_3', direction: 'west' },
      { fromTag: 'sd_hallway_7', toTag: 'sd_hallway_8', direction: 'east' },
      { fromTag: 'sd_hallway_8', toTag: 'sd_hallway_7', direction: 'west' },
      { fromTag: 'sd_hallway_8', toTag: 'sd_hallway_9', direction: 'east' },
      { fromTag: 'sd_hallway_9', toTag: 'sd_hallway_8', direction: 'west' },
      { fromTag: 'sd_hallway_9', toTag: 'sd_hallway_10', direction: 'east' },
      { fromTag: 'sd_hallway_10', toTag: 'sd_hallway_9', direction: 'west' },
      { fromTag: 'sd_hallway_10', toTag: 'sd_6', direction: 'east' },
      { fromTag: 'sd_6', toTag: 'sd_hallway_10', direction: 'west' },
      { fromTag: 'sd_6', toTag: 'sd_7', direction: 'east' },
      { fromTag: 'sd_7', toTag: 'sd_6', direction: 'west' },

      // === Row D: east-west ===
      // T(19) is isolated east-west; S(23) starts a new chain
      { fromTag: 'sd_storage_3', toTag: 'sd_hallway_11', direction: 'east' },
      { fromTag: 'sd_hallway_11', toTag: 'sd_storage_3', direction: 'west' },
      { fromTag: 'sd_hallway_11', toTag: 'sd_hallway_12', direction: 'east' },
      { fromTag: 'sd_hallway_12', toTag: 'sd_hallway_11', direction: 'west' },
      { fromTag: 'sd_hallway_12', toTag: 'sd_hallway_13', direction: 'east' },
      { fromTag: 'sd_hallway_13', toTag: 'sd_hallway_12', direction: 'west' },
      { fromTag: 'sd_hallway_13', toTag: 'sd_8', direction: 'east' },
      { fromTag: 'sd_8', toTag: 'sd_hallway_13', direction: 'west' },
      { fromTag: 'sd_8', toTag: 'sd_9', direction: 'east' },
      { fromTag: 'sd_9', toTag: 'sd_8', direction: 'west' },

      // === Row E: east-west ===
      { fromTag: 'sd_10', toTag: 'sd_11', direction: 'east' },
      { fromTag: 'sd_11', toTag: 'sd_10', direction: 'west' },
      { fromTag: 'sd_11', toTag: 'sd_hallway_14', direction: 'east' },
      { fromTag: 'sd_hallway_14', toTag: 'sd_11', direction: 'west' },
      // A(31) and H(35) are isolated east-west
      { fromTag: 'sd_office', toTag: 'sd_12', direction: 'east' },
      { fromTag: 'sd_12', toTag: 'sd_office', direction: 'west' },

      // === Row F: east-west ===
      // *(19) is isolated east-west
      { fromTag: 'sd_14', toTag: 'sd_hallway_16', direction: 'east' },
      { fromTag: 'sd_hallway_16', toTag: 'sd_14', direction: 'west' },
      { fromTag: 'sd_hallway_16', toTag: 'sd_hallway_17', direction: 'east' },
      { fromTag: 'sd_hallway_17', toTag: 'sd_hallway_16', direction: 'west' },
      { fromTag: 'sd_hallway_17', toTag: 'sd_hallway_18', direction: 'east' },
      { fromTag: 'sd_hallway_18', toTag: 'sd_hallway_17', direction: 'west' },
      // q(39) and R(43) are isolated east-west

      // === Row G: east-west ===
      { fromTag: 'sd_15', toTag: 'sd_16', direction: 'east' },
      { fromTag: 'sd_16', toTag: 'sd_15', direction: 'west' },
      { fromTag: 'sd_16', toTag: 'sd_17', direction: 'east' },
      { fromTag: 'sd_17', toTag: 'sd_16', direction: 'west' },
      // L(31) and P(35) are isolated east-west

      // === Row 0 to Row A: north-south (with doors) ===
      { fromTag: 'sd_quarters_1', toTag: 'sd_qhall_1', direction: 'south' },
      { fromTag: 'sd_qhall_1', toTag: 'sd_quarters_1', direction: 'north' },
      { fromTag: 'sd_quarters_2', toTag: 'sd_qhall_2', direction: 'south' },
      { fromTag: 'sd_qhall_2', toTag: 'sd_quarters_2', direction: 'north' },
      { fromTag: 'sd_quarters_3', toTag: 'sd_qhall_3', direction: 'south' },
      { fromTag: 'sd_qhall_3', toTag: 'sd_quarters_3', direction: 'north' },

      // === Row A to Row B: north-south ===
      { fromTag: 'sd_storage_1', toTag: 'sd_3', direction: 'south' },
      { fromTag: 'sd_3', toTag: 'sd_storage_1', direction: 'north' },
      { fromTag: 'sd_storage_2', toTag: 'sd_4', direction: 'south' },
      { fromTag: 'sd_4', toTag: 'sd_storage_2', direction: 'north' },
      { fromTag: 'sd_hallway_19', toTag: 'sd_hallway_20', direction: 'south' },
      { fromTag: 'sd_hallway_20', toTag: 'sd_hallway_19', direction: 'north' },
      { fromTag: 'sd_hallway_2', toTag: 'sd_hallway_4', direction: 'south' },
      { fromTag: 'sd_hallway_4', toTag: 'sd_hallway_2', direction: 'north' },
      { fromTag: 'sd_qhall_2', toTag: 'sd_meeting', direction: 'south' },
      { fromTag: 'sd_meeting', toTag: 'sd_qhall_2', direction: 'north' },

      // === Row B to Row C: north-south ===
      { fromTag: 'sd_1', toTag: 'sd_entrance', direction: 'south' },
      { fromTag: 'sd_entrance', toTag: 'sd_1', direction: 'north' },
      { fromTag: 'sd_4', toTag: 'sd_threshold_2', direction: 'south' },
      { fromTag: 'sd_threshold_2', toTag: 'sd_4', direction: 'north' },
      { fromTag: 'sd_hallway_20', toTag: 'sd_guard_3', direction: 'south' },
      { fromTag: 'sd_guard_3', toTag: 'sd_hallway_20', direction: 'north' },
      { fromTag: 'sd_hallway_5', toTag: 'sd_hallway_9', direction: 'south' },
      { fromTag: 'sd_hallway_9', toTag: 'sd_hallway_5', direction: 'north' },

      // === Row C to Row D: north-south ===
      { fromTag: 'sd_guard_3', toTag: 'sd_threshold_3', direction: 'south' },
      { fromTag: 'sd_threshold_3', toTag: 'sd_guard_3', direction: 'north' },
      { fromTag: 'sd_hallway_8', toTag: 'sd_hallway_11', direction: 'south' },
      { fromTag: 'sd_hallway_11', toTag: 'sd_hallway_8', direction: 'north' },
      { fromTag: 'sd_hallway_10', toTag: 'sd_hallway_13', direction: 'south' },
      { fromTag: 'sd_hallway_13', toTag: 'sd_hallway_10', direction: 'north' },
      { fromTag: 'sd_7', toTag: 'sd_9', direction: 'south' },
      { fromTag: 'sd_9', toTag: 'sd_7', direction: 'north' },

      // === Row D to Row E: north-south ===
      { fromTag: 'sd_threshold_3', toTag: 'sd_10', direction: 'south' },
      { fromTag: 'sd_10', toTag: 'sd_threshold_3', direction: 'north' },
      { fromTag: 'sd_hallway_11', toTag: 'sd_hallway_14', direction: 'south' },
      { fromTag: 'sd_hallway_14', toTag: 'sd_hallway_11', direction: 'north' },
      { fromTag: 'sd_hallway_12', toTag: 'sd_altar_2', direction: 'south' },
      { fromTag: 'sd_altar_2', toTag: 'sd_hallway_12', direction: 'north' },
      { fromTag: 'sd_hallway_13', toTag: 'sd_hallway_15', direction: 'south' },
      { fromTag: 'sd_hallway_15', toTag: 'sd_hallway_13', direction: 'north' },
      { fromTag: 'sd_9', toTag: 'sd_12', direction: 'south' },
      { fromTag: 'sd_12', toTag: 'sd_9', direction: 'north' },

      // === Row E to Row F: north-south ===
      { fromTag: 'sd_10', toTag: 'sd_13', direction: 'south' },
      { fromTag: 'sd_13', toTag: 'sd_10', direction: 'north' },
      { fromTag: 'sd_hallway_14', toTag: 'sd_hallway_16', direction: 'south' },
      { fromTag: 'sd_hallway_16', toTag: 'sd_hallway_14', direction: 'north' },
      { fromTag: 'sd_hallway_15', toTag: 'sd_hallway_18', direction: 'south' },
      { fromTag: 'sd_hallway_18', toTag: 'sd_hallway_15', direction: 'north' },
      { fromTag: 'sd_office', toTag: 'sd_leader_quarters', direction: 'south' },
      { fromTag: 'sd_leader_quarters', toTag: 'sd_office', direction: 'north' },
      { fromTag: 'sd_12', toTag: 'sd_reliquary', direction: 'south' },
      { fromTag: 'sd_reliquary', toTag: 'sd_12', direction: 'north' },

      // === Row F to Row G: north-south ===
      { fromTag: 'sd_13', toTag: 'sd_15', direction: 'south' },
      { fromTag: 'sd_15', toTag: 'sd_13', direction: 'north' },
      { fromTag: 'sd_14', toTag: 'sd_16', direction: 'south' },
      { fromTag: 'sd_16', toTag: 'sd_14', direction: 'north' },
      { fromTag: 'sd_hallway_17', toTag: 'sd_scriptorium', direction: 'south' },
      { fromTag: 'sd_scriptorium', toTag: 'sd_hallway_17', direction: 'north' },
      { fromTag: 'sd_hallway_18', toTag: 'sd_prep', direction: 'south' },
      { fromTag: 'sd_prep', toTag: 'sd_hallway_18', direction: 'north' },
    ],

    doors: [
      // Quarters doors (unlocked, closed)
      {
        name: 'wooden door',
        doorType: 'physical',
        entryTag: 'sd_qhall_1',
        entryDirection: 'north',
        exitTag: 'sd_quarters_1',
        exitDirection: 'south',
        defaultState: 'closed',
      },
      {
        name: 'wooden door',
        doorType: 'physical',
        entryTag: 'sd_qhall_2',
        entryDirection: 'north',
        exitTag: 'sd_quarters_2',
        exitDirection: 'south',
        defaultState: 'closed',
      },
      {
        name: 'wooden door',
        doorType: 'physical',
        entryTag: 'sd_qhall_3',
        entryDirection: 'north',
        exitTag: 'sd_quarters_3',
        exitDirection: 'south',
        defaultState: 'closed',
      },
      // Cult leader's quarters (locked)
      {
        name: 'iron door',
        doorType: 'physical',
        entryTag: 'sd_office',
        entryDirection: 'south',
        exitTag: 'sd_leader_quarters',
        exitDirection: 'north',
        defaultState: 'locked',
        hasLock: true,
        pickDifficultyMin: 100,
        pickDifficultyMax: 120,
        bashDifficulty: 200,
        denialMessage: 'The heavy iron door is locked. A sturdy lock holds it firmly shut.',
      },
    ],
  };
}
