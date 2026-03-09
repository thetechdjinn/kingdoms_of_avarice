/**
 * Warrens of Filth — 69 rooms.
 * First quest sub-zone branching off the Arindale Sewer central hub.
 * Claustrophobic, vermin-infested rat territory. Level 3-4.
 * Boss: Retchtail, the Rat King in his lair at the deepest point.
 *
 * Entered from sewer_entrance_warrens (east_tunnels.ts) going south.
 *
 * Layout: See areas/warrens_of_filth/plan.md for the canonical ASCII map.
 *
 * Map orientation: the warrens extend EAST from the sewer entrance.
 * In the ASCII map, LEFT = west (toward sewer), RIGHT = east (deeper).
 * UP = north, DOWN = south (standard).
 *
 * Tag assignments by map region:
 *   Entrance corridor (row 3 left):     entrance, crawl_1, crawl_2, passage_1, junction
 *   Passage branch (rows 1-2 left):     passage_2, passage_3, passage_4, bone_heap
 *   North loop (rows 0-2):              north_1..north_9
 *   Scratched corridors:                scratched_1..4 (main), scratched_5..9 (branches)
 *   Collapsed drain:                    collapsed
 *   Nesting chambers:                   nesting_1, nesting_2
 *   South branch:                       south_1..11, feeding, refuse
 *   Filthy tunnel perimeter:            filthy_1..17
 *   Boss area (inside filthy rect):     deep_1..7, antechamber, lair
 */
import { DistrictData } from '../arindale/types.js';
import { warrensDescription, maybeAddWarrensDetail } from './descriptions.js';

const AREA = 'Warrens of Filth';
const TERRAIN = 'underground';

function desc(section: 'passage' | 'scratched' | 'filthy' | 'deep', tag: string): string {
  return maybeAddWarrensDetail(warrensDescription(section, tag), tag);
}

function room(tag: string, name: string, description: string) {
  return { tag, name, description, area: AREA, terrain: TERRAIN };
}

export function getWarrens(): DistrictData {
  return {
    rooms: [
      // === Entrance corridor (5 rooms) ===
      room('warrens_entrance', 'Gnawed Entrance',
        `The sewer wall has been torn open from the other side, creating a ragged hole into a different world. Beyond the opening, the stone gives way to packed earth and gnawed brick. The stench is immediate and overpowering — concentrated animal filth, matted fur, and rotting food. The ceiling drops sharply, forcing a crouch. Whatever lives beyond has been here a long time.`),
      room('warrens_crawl_1', 'Narrow Burrow', desc('passage', 'warrens_crawl_1')),
      room('warrens_crawl_2', 'Narrow Burrow', desc('passage', 'warrens_crawl_2')),
      room('warrens_passage_1', 'Vermin Passage', desc('passage', 'warrens_passage_1')),
      room('warrens_junction', 'Burrow Junction',
        `A crossroads where four tunnels meet in a cramped, low-ceilinged chamber. The floor is a churned mess of droppings, shed fur, and small bones. Claw marks radiate out along every wall, territorial markers scored deep into the stone. The chittering of rats echoes from every direction, impossible to localize. This is the heart of their territory.`),

      // === Passage branch from crawl_1, north (4 rooms) ===
      room('warrens_passage_2', 'Widening Passage',
        `The passage opens slightly where two burrows merge. The walls are gouged by the passage of bodies, smoothed by fur and filth. Droppings carpet the floor in layers, the older ones calcite-white beneath the fresh. The air is thick with heat and the musk of a large colony.`),
      room('warrens_passage_3', 'Vermin Passage', desc('passage', 'warrens_passage_3')),
      room('warrens_passage_4', 'Vermin Passage', desc('passage', 'warrens_passage_4')),
      room('warrens_bone_heap', 'Bone Heap',
        `The tunnel ends at a mound of small bones — birds, cats, other rats, and things less identifiable. The pile reaches waist-height, picked perfectly clean and bleached pale by time. Newer additions sit atop the heap, still bearing scraps of dried sinew. This is the colony's charnel mound, where the remains of meals are deposited and forgotten. The smell is old death, dry and chalky.`),

      // === North loop (9 rooms) ===
      room('warrens_north_1', 'Vermin Passage', desc('passage', 'warrens_north_1')),
      room('warrens_north_2', 'Vermin Passage', desc('passage', 'warrens_north_2')),
      room('warrens_north_3', 'Vermin Passage', desc('passage', 'warrens_north_3')),
      room('warrens_north_4', 'Vermin Passage', desc('passage', 'warrens_north_4')),
      room('warrens_north_5', 'Vermin Passage', desc('passage', 'warrens_north_5')),
      room('warrens_north_6', 'Vermin Passage', desc('passage', 'warrens_north_6')),
      room('warrens_north_7', 'Vermin Passage', desc('passage', 'warrens_north_7')),
      room('warrens_north_8', 'Dead-End Burrow', desc('passage', 'warrens_north_8')),
      room('warrens_north_9', 'Vermin Passage', desc('passage', 'warrens_north_9')),

      // === Collapsed drain (1 room, dead end) ===
      room('warrens_collapsed', 'Collapsed Drain',
        `A caved-in drainage pipe protrudes from the wall, its iron mouth buckled and split. Rubble and packed earth choke the passage beyond. Rats pour through gaps in the debris in a steady trickle — whatever lies on the other side is too collapsed to enter, but the vermin find their way through spaces no human could follow. Scratching sounds emanate from deep within the rubble.`),

      // === Scratched corridors (9 rooms) ===
      room('warrens_scratched_1', 'Scratched Corridor', desc('scratched', 'warrens_scratched_1')),
      room('warrens_scratched_2', 'Scratched Corridor', desc('scratched', 'warrens_scratched_2')),
      room('warrens_scratched_3', 'Scratched Corridor', desc('scratched', 'warrens_scratched_3')),
      room('warrens_scratched_4', 'Scratched Corridor', desc('scratched', 'warrens_scratched_4')),
      room('warrens_scratched_5', 'Scratched Corridor', desc('scratched', 'warrens_scratched_5')),
      room('warrens_scratched_6', 'Scratched Corridor', desc('scratched', 'warrens_scratched_6')),
      room('warrens_scratched_7', 'Scratched Corridor', desc('scratched', 'warrens_scratched_7')),
      room('warrens_scratched_8', 'Scratched Corridor', desc('scratched', 'warrens_scratched_8')),
      room('warrens_scratched_9', 'Scratched Corridor', desc('scratched', 'warrens_scratched_9')),

      // === Nesting chambers (2 rooms) ===
      room('warrens_nesting_1', 'Nesting Chamber',
        `A low-ceilinged chamber lined with shredded cloth, matted fur, and strips of gnawed leather. Smaller nests are pressed into the walls — shallow depressions packed with nesting material, each large enough for a single animal. The warmth of massed bodies makes the air stifling. This is a nursery of sorts — the colony breeds here, sheltered from the deeper tunnels.`),
      room('warrens_nesting_2', 'Nesting Chamber',
        `The second nesting chamber is larger and fouler than the first. The nests here are bigger — not for pups but for the mature adults of the colony. The shredded material is mixed with bones, stolen cloth, and unidentifiable organic matter. The stench of concentrated rat musk is overwhelming.`),

      // === South branch (11 generic rooms) ===
      room('warrens_south_1', 'Vermin Passage', desc('passage', 'warrens_south_1')),
      room('warrens_south_2', 'Vermin Passage', desc('passage', 'warrens_south_2')),
      room('warrens_south_3', 'Vermin Passage', desc('passage', 'warrens_south_3')),
      room('warrens_south_4', 'Vermin Passage', desc('passage', 'warrens_south_4')),
      room('warrens_south_5', 'Vermin Passage', desc('passage', 'warrens_south_5')),
      room('warrens_south_6', 'Vermin Passage', desc('passage', 'warrens_south_6')),
      room('warrens_south_7', 'Vermin Passage', desc('passage', 'warrens_south_7')),
      room('warrens_south_8', 'Vermin Passage', desc('passage', 'warrens_south_8')),
      room('warrens_south_9', 'Vermin Passage', desc('passage', 'warrens_south_9')),
      room('warrens_south_10', 'Vermin Passage', desc('passage', 'warrens_south_10')),
      room('warrens_south_11', 'Vermin Passage', desc('passage', 'warrens_south_11')),
      room('warrens_feeding', 'Feeding Ground',
        `Gnawed crates and torn sacks litter this wider chamber — food stores dragged down from the city above through cracks and drains. Grain spills across the floor, mixed with droppings and rat hair. Partially eaten vegetables, strips of salted meat reduced to leather, and the wreckage of a merchant's pantry are scattered about. The colony feeds here, and the evidence of their appetite is staggering.`),
      room('warrens_refuse', 'Refuse Pit',
        `A sunken chamber filled with rotting food and waste — the colony's dump. Gnawed carcasses, decomposing vegetables stolen from the city above, and mounds of excrement fill the depression to overflowing. The smell is beyond description. Flies swarm in thick clouds despite the underground chill. The rats deposit their waste here and avoid the chamber otherwise. Nothing of value remains in this reeking pit.`),

      // === Filthy tunnel perimeter (17 rooms) ===
      room('warrens_filthy_1', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_1')),
      room('warrens_filthy_2', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_2')),
      room('warrens_filthy_3', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_3')),
      room('warrens_filthy_4', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_4')),
      room('warrens_filthy_5', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_5')),
      room('warrens_filthy_6', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_6')),
      room('warrens_filthy_7', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_7')),
      room('warrens_filthy_8', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_8')),
      room('warrens_filthy_9', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_9')),
      room('warrens_filthy_10', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_10')),
      room('warrens_filthy_11', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_11')),
      room('warrens_filthy_12', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_12')),
      room('warrens_filthy_13', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_13')),
      room('warrens_filthy_14', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_14')),
      room('warrens_filthy_15', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_15')),
      room('warrens_filthy_16', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_16')),
      room('warrens_filthy_17', 'Filthy Tunnel', desc('filthy', 'warrens_filthy_17')),

      // === Boss area — deep burrows + lair (9 rooms) ===
      room('warrens_deep_1', 'Deep Burrow', desc('deep', 'warrens_deep_1')),
      room('warrens_deep_2', 'Deep Burrow', desc('deep', 'warrens_deep_2')),
      room('warrens_deep_3', 'Deep Burrow', desc('deep', 'warrens_deep_3')),
      room('warrens_deep_4', 'Deep Burrow', desc('deep', 'warrens_deep_4')),
      room('warrens_deep_5', 'Deep Burrow', desc('deep', 'warrens_deep_5')),
      room('warrens_deep_6', 'Deep Burrow', desc('deep', 'warrens_deep_6')),
      room('warrens_deep_7', 'Deep Burrow', desc('deep', 'warrens_deep_7')),
      room('warrens_antechamber', 'Lair Antechamber',
        `The burrow opens into a low antechamber choked with the stench of something immense and alive. The floor is a compressed mat of refuse, fur, and bone. The walls are gouged with claw marks far deeper than any seen before — made by something the size of a large dog, or bigger. A massive opening yawns ahead, and from beyond it comes the sound of labored breathing and the rustle of something vast shifting in its nest.`),
      room('warrens_lair', "Retchtail's Lair",
        `A cavernous chamber hollowed out over decades of gnawing and burrowing, its ceiling just high enough to stand. The entire floor is a massive nest — a room-sized tangle of shredded cloth, cracked bones, matted fur, stolen rope, splintered wood, and every piece of refuse the colony has accumulated. The nest crunches and shifts underfoot, unstable and treacherous. At its center, a depression the size of a bed marks where the Rat King rests. The stench is indescribable — the concentrated reek of the largest, oldest, most vicious creature in the warren. Retchtail's domain.`),
    ],

    exits: [
      // === Sewer connection ===
      { fromTag: 'sewer_entrance_warrens', toTag: 'warrens_entrance', direction: 'south' },
      { fromTag: 'warrens_entrance', toTag: 'sewer_entrance_warrens', direction: 'north' },

      // === Entrance corridor (east from entrance toward junction) ===
      { fromTag: 'warrens_entrance', toTag: 'warrens_crawl_1', direction: 'east' },
      { fromTag: 'warrens_crawl_1', toTag: 'warrens_entrance', direction: 'west' },
      { fromTag: 'warrens_crawl_1', toTag: 'warrens_crawl_2', direction: 'east' },
      { fromTag: 'warrens_crawl_2', toTag: 'warrens_crawl_1', direction: 'west' },
      { fromTag: 'warrens_crawl_2', toTag: 'warrens_passage_1', direction: 'east' },
      { fromTag: 'warrens_passage_1', toTag: 'warrens_crawl_2', direction: 'west' },
      { fromTag: 'warrens_passage_1', toTag: 'warrens_junction', direction: 'east' },
      { fromTag: 'warrens_junction', toTag: 'warrens_passage_1', direction: 'west' },

      // === Passage branch (north from crawl_1, then east to bone heap) ===
      { fromTag: 'warrens_crawl_1', toTag: 'warrens_passage_2', direction: 'north' },
      { fromTag: 'warrens_passage_2', toTag: 'warrens_crawl_1', direction: 'south' },
      { fromTag: 'warrens_passage_2', toTag: 'warrens_passage_3', direction: 'east' },
      { fromTag: 'warrens_passage_3', toTag: 'warrens_passage_2', direction: 'west' },
      { fromTag: 'warrens_passage_3', toTag: 'warrens_passage_4', direction: 'east' },
      { fromTag: 'warrens_passage_4', toTag: 'warrens_passage_3', direction: 'west' },
      { fromTag: 'warrens_passage_4', toTag: 'warrens_bone_heap', direction: 'north' },
      { fromTag: 'warrens_bone_heap', toTag: 'warrens_passage_4', direction: 'south' },

      // === North loop (north from junction, east across top, south back) ===
      { fromTag: 'warrens_junction', toTag: 'warrens_north_1', direction: 'north' },
      { fromTag: 'warrens_north_1', toTag: 'warrens_junction', direction: 'south' },
      { fromTag: 'warrens_north_1', toTag: 'warrens_north_2', direction: 'north' },
      { fromTag: 'warrens_north_2', toTag: 'warrens_north_1', direction: 'south' },
      { fromTag: 'warrens_north_2', toTag: 'warrens_north_3', direction: 'east' },
      { fromTag: 'warrens_north_3', toTag: 'warrens_north_2', direction: 'west' },
      { fromTag: 'warrens_north_3', toTag: 'warrens_north_4', direction: 'north' },
      { fromTag: 'warrens_north_4', toTag: 'warrens_north_3', direction: 'south' },
      { fromTag: 'warrens_north_4', toTag: 'warrens_north_5', direction: 'east' },
      { fromTag: 'warrens_north_5', toTag: 'warrens_north_4', direction: 'west' },
      { fromTag: 'warrens_north_5', toTag: 'warrens_north_6', direction: 'east' },
      { fromTag: 'warrens_north_6', toTag: 'warrens_north_5', direction: 'west' },
      { fromTag: 'warrens_north_6', toTag: 'warrens_north_7', direction: 'east' },
      { fromTag: 'warrens_north_7', toTag: 'warrens_north_6', direction: 'west' },
      // Dead end south of north_5
      { fromTag: 'warrens_north_5', toTag: 'warrens_north_8', direction: 'south' },
      { fromTag: 'warrens_north_8', toTag: 'warrens_north_5', direction: 'north' },
      // North_7 south to north_9 (connects back to scratched/filthy area)
      { fromTag: 'warrens_north_7', toTag: 'warrens_north_9', direction: 'south' },
      { fromTag: 'warrens_north_9', toTag: 'warrens_north_7', direction: 'north' },

      // === North-to-scratched and north-to-filthy cross-connections ===
      { fromTag: 'warrens_scratched_5', toTag: 'warrens_north_9', direction: 'east' },
      { fromTag: 'warrens_north_9', toTag: 'warrens_scratched_5', direction: 'west' },
      { fromTag: 'warrens_north_9', toTag: 'warrens_filthy_1', direction: 'east' },
      { fromTag: 'warrens_filthy_1', toTag: 'warrens_north_9', direction: 'west' },

      // === Scratched corridors (main chain east from junction) ===
      { fromTag: 'warrens_junction', toTag: 'warrens_scratched_1', direction: 'east' },
      { fromTag: 'warrens_scratched_1', toTag: 'warrens_junction', direction: 'west' },
      { fromTag: 'warrens_scratched_1', toTag: 'warrens_scratched_2', direction: 'east' },
      { fromTag: 'warrens_scratched_2', toTag: 'warrens_scratched_1', direction: 'west' },
      { fromTag: 'warrens_scratched_2', toTag: 'warrens_scratched_3', direction: 'east' },
      { fromTag: 'warrens_scratched_3', toTag: 'warrens_scratched_2', direction: 'west' },
      { fromTag: 'warrens_scratched_3', toTag: 'warrens_scratched_4', direction: 'east' },
      { fromTag: 'warrens_scratched_4', toTag: 'warrens_scratched_3', direction: 'west' },
      // Scratched_4 continues east to nesting_1
      { fromTag: 'warrens_scratched_4', toTag: 'warrens_nesting_1', direction: 'east' },
      { fromTag: 'warrens_nesting_1', toTag: 'warrens_scratched_4', direction: 'west' },

      // === Scratched branches (rows above and below main corridor) ===
      // scratched_4 connects north to scratched_8 and south to scratched_9
      { fromTag: 'warrens_scratched_4', toTag: 'warrens_scratched_8', direction: 'north' },
      { fromTag: 'warrens_scratched_8', toTag: 'warrens_scratched_4', direction: 'south' },
      { fromTag: 'warrens_scratched_4', toTag: 'warrens_scratched_9', direction: 'south' },
      { fromTag: 'warrens_scratched_9', toTag: 'warrens_scratched_4', direction: 'north' },
      // Row 2 scratched chain: collapsed—scr_6—scr_7—scr_8
      { fromTag: 'warrens_collapsed', toTag: 'warrens_scratched_6', direction: 'east' },
      { fromTag: 'warrens_scratched_6', toTag: 'warrens_collapsed', direction: 'west' },
      { fromTag: 'warrens_scratched_6', toTag: 'warrens_scratched_7', direction: 'east' },
      { fromTag: 'warrens_scratched_7', toTag: 'warrens_scratched_6', direction: 'west' },
      { fromTag: 'warrens_scratched_7', toTag: 'warrens_scratched_8', direction: 'east' },
      { fromTag: 'warrens_scratched_8', toTag: 'warrens_scratched_7', direction: 'west' },
      // scratched_2 connects north to scratched_6
      { fromTag: 'warrens_scratched_2', toTag: 'warrens_scratched_6', direction: 'north' },
      { fromTag: 'warrens_scratched_6', toTag: 'warrens_scratched_2', direction: 'south' },
      // scratched_5 connects south to scratched_7
      { fromTag: 'warrens_scratched_5', toTag: 'warrens_scratched_7', direction: 'south' },
      { fromTag: 'warrens_scratched_7', toTag: 'warrens_scratched_5', direction: 'north' },

      // === Nesting chambers ===
      { fromTag: 'warrens_nesting_1', toTag: 'warrens_nesting_2', direction: 'south' },
      { fromTag: 'warrens_nesting_2', toTag: 'warrens_nesting_1', direction: 'north' },
      // scratched_9 connects east to nesting_2
      { fromTag: 'warrens_scratched_9', toTag: 'warrens_nesting_2', direction: 'east' },
      { fromTag: 'warrens_nesting_2', toTag: 'warrens_scratched_9', direction: 'west' },

      // === South branch (south from junction, then east/south loops) ===
      { fromTag: 'warrens_junction', toTag: 'warrens_south_1', direction: 'south' },
      { fromTag: 'warrens_south_1', toTag: 'warrens_junction', direction: 'north' },
      // Row 4 chain: south_1—south_2—south_3—south_4
      { fromTag: 'warrens_south_1', toTag: 'warrens_south_2', direction: 'east' },
      { fromTag: 'warrens_south_2', toTag: 'warrens_south_1', direction: 'west' },
      { fromTag: 'warrens_south_2', toTag: 'warrens_south_3', direction: 'east' },
      { fromTag: 'warrens_south_3', toTag: 'warrens_south_2', direction: 'west' },
      { fromTag: 'warrens_south_3', toTag: 'warrens_south_4', direction: 'east' },
      { fromTag: 'warrens_south_4', toTag: 'warrens_south_3', direction: 'west' },
      // south_4 continues east to scratched_9
      { fromTag: 'warrens_south_4', toTag: 'warrens_scratched_9', direction: 'east' },
      { fromTag: 'warrens_scratched_9', toTag: 'warrens_south_4', direction: 'west' },
      // south_4 south to south_8
      { fromTag: 'warrens_south_4', toTag: 'warrens_south_8', direction: 'south' },
      { fromTag: 'warrens_south_8', toTag: 'warrens_south_4', direction: 'north' },
      // south_8 west to south_7, south_7 west to south_6
      { fromTag: 'warrens_south_8', toTag: 'warrens_south_7', direction: 'west' },
      { fromTag: 'warrens_south_7', toTag: 'warrens_south_8', direction: 'east' },
      { fromTag: 'warrens_south_7', toTag: 'warrens_south_6', direction: 'west' },
      { fromTag: 'warrens_south_6', toTag: 'warrens_south_7', direction: 'east' },
      // south_8 east to feeding (dead end)
      { fromTag: 'warrens_south_8', toTag: 'warrens_feeding', direction: 'east' },
      { fromTag: 'warrens_feeding', toTag: 'warrens_south_8', direction: 'west' },
      // south_1 south to south_5
      { fromTag: 'warrens_south_1', toTag: 'warrens_south_5', direction: 'south' },
      { fromTag: 'warrens_south_5', toTag: 'warrens_south_1', direction: 'north' },
      // south_5 south to south_9
      { fromTag: 'warrens_south_5', toTag: 'warrens_south_9', direction: 'south' },
      { fromTag: 'warrens_south_9', toTag: 'warrens_south_5', direction: 'north' },
      // south_9 east to south_10
      { fromTag: 'warrens_south_9', toTag: 'warrens_south_10', direction: 'east' },
      { fromTag: 'warrens_south_10', toTag: 'warrens_south_9', direction: 'west' },
      // south_6 south to south_10
      { fromTag: 'warrens_south_6', toTag: 'warrens_south_10', direction: 'south' },
      { fromTag: 'warrens_south_10', toTag: 'warrens_south_6', direction: 'north' },
      // south_8 south to south_11
      { fromTag: 'warrens_south_8', toTag: 'warrens_south_11', direction: 'south' },
      { fromTag: 'warrens_south_11', toTag: 'warrens_south_8', direction: 'north' },
      // south_11 west to refuse (dead end)
      { fromTag: 'warrens_south_11', toTag: 'warrens_refuse', direction: 'west' },
      { fromTag: 'warrens_refuse', toTag: 'warrens_south_11', direction: 'east' },
      // south_11 east to filthy_17 (bridges south branch to filthy perimeter)
      { fromTag: 'warrens_south_11', toTag: 'warrens_filthy_17', direction: 'east' },
      { fromTag: 'warrens_filthy_17', toTag: 'warrens_south_11', direction: 'west' },

      // === Filthy tunnel perimeter (U-shaped, north approach then clockwise) ===
      // North approach: filthy_1 (row 1) south through filthy_2 (row 2) east to filthy_3
      { fromTag: 'warrens_filthy_1', toTag: 'warrens_filthy_2', direction: 'south' },
      { fromTag: 'warrens_filthy_2', toTag: 'warrens_filthy_1', direction: 'north' },
      { fromTag: 'warrens_filthy_2', toTag: 'warrens_filthy_3', direction: 'east' },
      { fromTag: 'warrens_filthy_3', toTag: 'warrens_filthy_2', direction: 'west' },
      // Top of rectangle (row 3): filthy_3 south to filthy_4, then east chain
      { fromTag: 'warrens_filthy_3', toTag: 'warrens_filthy_4', direction: 'south' },
      { fromTag: 'warrens_filthy_4', toTag: 'warrens_filthy_3', direction: 'north' },
      { fromTag: 'warrens_filthy_4', toTag: 'warrens_filthy_5', direction: 'east' },
      { fromTag: 'warrens_filthy_5', toTag: 'warrens_filthy_4', direction: 'west' },
      { fromTag: 'warrens_filthy_5', toTag: 'warrens_filthy_6', direction: 'east' },
      { fromTag: 'warrens_filthy_6', toTag: 'warrens_filthy_5', direction: 'west' },
      { fromTag: 'warrens_filthy_6', toTag: 'warrens_filthy_7', direction: 'east' },
      { fromTag: 'warrens_filthy_7', toTag: 'warrens_filthy_6', direction: 'west' },
      // Right side (column): filthy_7 south through filthy_8—9—10—11
      { fromTag: 'warrens_filthy_7', toTag: 'warrens_filthy_8', direction: 'south' },
      { fromTag: 'warrens_filthy_8', toTag: 'warrens_filthy_7', direction: 'north' },
      { fromTag: 'warrens_filthy_8', toTag: 'warrens_filthy_9', direction: 'south' },
      { fromTag: 'warrens_filthy_9', toTag: 'warrens_filthy_8', direction: 'north' },
      { fromTag: 'warrens_filthy_9', toTag: 'warrens_filthy_10', direction: 'south' },
      { fromTag: 'warrens_filthy_10', toTag: 'warrens_filthy_9', direction: 'north' },
      { fromTag: 'warrens_filthy_10', toTag: 'warrens_filthy_11', direction: 'south' },
      { fromTag: 'warrens_filthy_11', toTag: 'warrens_filthy_10', direction: 'north' },
      // Bottom row (west = back toward entrance): filthy_11 west through 12—13—14—15—16
      { fromTag: 'warrens_filthy_11', toTag: 'warrens_filthy_12', direction: 'west' },
      { fromTag: 'warrens_filthy_12', toTag: 'warrens_filthy_11', direction: 'east' },
      { fromTag: 'warrens_filthy_12', toTag: 'warrens_filthy_13', direction: 'west' },
      { fromTag: 'warrens_filthy_13', toTag: 'warrens_filthy_12', direction: 'east' },
      { fromTag: 'warrens_filthy_13', toTag: 'warrens_filthy_14', direction: 'west' },
      { fromTag: 'warrens_filthy_14', toTag: 'warrens_filthy_13', direction: 'east' },
      { fromTag: 'warrens_filthy_14', toTag: 'warrens_filthy_15', direction: 'west' },
      { fromTag: 'warrens_filthy_15', toTag: 'warrens_filthy_14', direction: 'east' },
      { fromTag: 'warrens_filthy_15', toTag: 'warrens_filthy_16', direction: 'west' },
      { fromTag: 'warrens_filthy_16', toTag: 'warrens_filthy_15', direction: 'east' },
      // Left-bottom corner: filthy_16 north to filthy_17
      { fromTag: 'warrens_filthy_16', toTag: 'warrens_filthy_17', direction: 'north' },
      { fromTag: 'warrens_filthy_17', toTag: 'warrens_filthy_16', direction: 'south' },

      // === Boss area (inside filthy rectangle, entered west from filthy_8) ===
      // U-shaped path: west from filthy_8 to deep_1—2—3, south to deep_4—5,
      // east to deep_6—7, north to antechamber, west to lair
      { fromTag: 'warrens_filthy_8', toTag: 'warrens_deep_1', direction: 'west' },
      { fromTag: 'warrens_deep_1', toTag: 'warrens_filthy_8', direction: 'east' },
      { fromTag: 'warrens_deep_1', toTag: 'warrens_deep_2', direction: 'west' },
      { fromTag: 'warrens_deep_2', toTag: 'warrens_deep_1', direction: 'east' },
      { fromTag: 'warrens_deep_2', toTag: 'warrens_deep_3', direction: 'west' },
      { fromTag: 'warrens_deep_3', toTag: 'warrens_deep_2', direction: 'east' },
      { fromTag: 'warrens_deep_3', toTag: 'warrens_deep_4', direction: 'south' },
      { fromTag: 'warrens_deep_4', toTag: 'warrens_deep_3', direction: 'north' },
      { fromTag: 'warrens_deep_4', toTag: 'warrens_deep_5', direction: 'south' },
      { fromTag: 'warrens_deep_5', toTag: 'warrens_deep_4', direction: 'north' },
      { fromTag: 'warrens_deep_5', toTag: 'warrens_deep_6', direction: 'east' },
      { fromTag: 'warrens_deep_6', toTag: 'warrens_deep_5', direction: 'west' },
      { fromTag: 'warrens_deep_6', toTag: 'warrens_deep_7', direction: 'east' },
      { fromTag: 'warrens_deep_7', toTag: 'warrens_deep_6', direction: 'west' },
      { fromTag: 'warrens_deep_7', toTag: 'warrens_antechamber', direction: 'north' },
      { fromTag: 'warrens_antechamber', toTag: 'warrens_deep_7', direction: 'south' },
      { fromTag: 'warrens_antechamber', toTag: 'warrens_lair', direction: 'west' },
      { fromTag: 'warrens_lair', toTag: 'warrens_antechamber', direction: 'east' },
    ],

    doors: [],
  };
}
