/**
 * Hearthstead — 89 rooms.
 * New player starting zone northeast of Arindale.
 *
 * Layout: See areas/hearthstead/plan.md for the canonical ASCII map.
 *
 * Sections:
 *   Road (6 rooms) — Path from Arindale to the loop crossing, with river crossing.
 *   Loop (25 rooms) — Battle ring encircling the hamlet. Monsters roam here.
 *   Hamlet (12 rooms) — Safe village inside the loop. Spawn point, shops, inn, healer.
 *   Wilds Forest (26 rooms) — Quest forest north of G via `go path`.
 *   Wilds Cave (20 rooms) — Underground cave with bear boss (B) and goblin mini-boss (K).
 *
 * Area strings:
 *   'Hearthstead'       — Road + hamlet rooms (safe zone, no monsters)
 *   'Hearthstead Loop'  — All loop rooms including L and G (monsters roam)
 *   'Hearthstead Wilds' — All wilds rooms: forest + cave (monsters roam)
 *
 * Terrain:
 *   'outdoor'      — Road, loop, hamlet, forest, cave entrance (C)
 *   'underground'  — All cave rooms except C
 *
 * Connection to Arindale: ew_0_3_2 (Harbor Rd, 2 rooms west of Eastwall St) northeast → hs_road_1
 *
 * Doors:
 *   1. swim river (R → N): triggered passageway across the river, south to north
 *   2. swim river (N → R): triggered passageway across the river, north to south
 *   3. go path (G → wilds_1): triggered passageway into the Hearthstead Wilds
 */
import { DistrictData } from '../arindale/types.js';
import {
  hearthsteadDescription,
  maybeAddDetail,
} from './descriptions.js';

// ── Area constants ─────────────────────────────────────────────────

const AREA_SAFE = 'Hearthstead';
const AREA_LOOP = 'Hearthstead Loop';
const AREA_WILDS = 'Hearthstead Wilds';

// ── Helper functions ───────────────────────────────────────────────

function roadRoom(tag: string) {
  return {
    tag,
    name: 'Coastal Road',
    description: hearthsteadDescription('road', tag),
    area: AREA_SAFE,
    terrain: 'outdoor',
  };
}

function loopRoom(tag: string) {
  return {
    tag,
    name: 'Hearthstead Trail',
    description: hearthsteadDescription('loop', tag),
    area: AREA_LOOP,
    terrain: 'outdoor',
  };
}

function approachRoom(tag: string) {
  return {
    tag,
    name: 'Hearthstead Approach',
    description: hearthsteadDescription('hamlet_approach', tag),
    area: AREA_SAFE,
    terrain: 'outdoor',
  };
}

function streetRoom(tag: string, name: string) {
  return {
    tag,
    name,
    description: hearthsteadDescription('hamlet_street', tag),
    area: AREA_SAFE,
    terrain: 'outdoor',
  };
}

function forestRoom(tag: string) {
  return {
    tag,
    name: 'Forest Trail',
    description: maybeAddDetail(hearthsteadDescription('forest', tag), tag, 'forest'),
    area: AREA_WILDS,
    terrain: 'outdoor',
  };
}

function caveRoom(tag: string) {
  return {
    tag,
    name: 'Cave Passage',
    description: maybeAddDetail(hearthsteadDescription('cave', tag), tag, 'cave'),
    area: AREA_WILDS,
    terrain: 'underground',
  };
}

// ── Main function ──────────────────────────────────────────────────

export function getHearthstead(): DistrictData {
  return {
    rooms: [
      // ================================================================
      // ROAD — 6 rooms (Arindale → river crossing → loop)
      // Area: Hearthstead (safe)
      // ================================================================

      roadRoom('hs_road_1'),
      roadRoom('hs_road_2'),
      {
        tag: 'hs_road_r',
        name: 'South Riverbank',
        description: `The road ends at the bank of a wide, slow-moving river. The water is dark and deep in the center but shallows near the edges, lapping gently against a muddy shore. On the far bank, the road continues northeast toward a cluster of buildings visible on the low bluff above, the village of Hearthstead. There is no bridge. The river must be crossed by swimming.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },
      {
        tag: 'hs_road_n',
        name: 'North Riverbank',
        description: `The road resumes on the north bank of the river, climbing gently away from the water. The muddy bank gives way to packed earth and scrubby grass. Behind, the river stretches wide and dark. Swimmable, but not inviting. Ahead, the road continues northeast through open grassland toward Hearthstead, its rooftops just visible above the rise.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },
      roadRoom('hs_road_5'),
      roadRoom('hs_road_6'),

      // ================================================================
      // LOOP — 25 rooms (battle ring around the hamlet)
      // Area: Hearthstead Loop (monsters roam)
      // ================================================================

      // --- Bottom row (line 134): L---*---*---* ---
      {
        tag: 'hs_loop_l',
        name: 'Forest Crossing',
        description: `A well-worn junction where several trails converge. The main path from the south meets a loop trail that circles Hearthstead, and a narrower track leads northeast toward the village center. The grass is trampled flat here from regular foot traffic. A weathered wooden sign points in several directions, though the paint has faded to near-illegibility.`,
        area: AREA_LOOP,
        terrain: 'outdoor',
      },
      loopRoom('hs_loop_1'),
      loopRoom('hs_loop_2'),
      loopRoom('hs_loop_3'),

      // --- Left side (counterclockwise from L going NW) ---
      loopRoom('hs_loop_4'),
      loopRoom('hs_loop_5'),
      loopRoom('hs_loop_6'),
      loopRoom('hs_loop_7'),
      loopRoom('hs_loop_8'),
      loopRoom('hs_loop_9'),
      loopRoom('hs_loop_10'),
      loopRoom('hs_loop_11'),

      // --- Top left (line 120) ---
      loopRoom('hs_loop_12'),
      loopRoom('hs_loop_13'),

      // --- Bridge room (line 118) ---
      loopRoom('hs_loop_14'),

      // --- G (go path trigger, line 116) ---
      {
        tag: 'hs_loop_g',
        name: 'Overgrown Clearing',
        description: `A wide spot on the trail where the grass grows tall and wild. The path continues south along the Hearthstead ring, but here at the northern edge, the vegetation is thicker and wilder. Tangled brush and young saplings crowd the trail's edge. Through the undergrowth to the north, a narrow, almost-hidden path disappears into denser forest. The air smells of earth and green growing things.`,
        area: AREA_LOOP,
        terrain: 'outdoor',
      },

      // --- Top right (line 120) ---
      loopRoom('hs_loop_15'),
      loopRoom('hs_loop_16'),
      loopRoom('hs_loop_17'),

      // --- Right side (clockwise from top going SE/S/SW) ---
      loopRoom('hs_loop_18'),
      loopRoom('hs_loop_19'),
      loopRoom('hs_loop_20'),
      loopRoom('hs_loop_21'),
      loopRoom('hs_loop_22'),
      loopRoom('hs_loop_23'),

      // ================================================================
      // HAMLET — 12 rooms (safe village inside the loop)
      // Area: Hearthstead (safe)
      // ================================================================

      // --- Approach from L (NE into the hamlet) ---
      approachRoom('hs_hamlet_app1'),
      approachRoom('hs_hamlet_app2'),
      approachRoom('hs_hamlet_app3'),

      // --- Spawn point ---
      {
        tag: 'hs_hamlet_s',
        name: 'Hearthstead Village Center',
        description: `The heart of Hearthstead. A handful of modest buildings cluster around a small unpaved square. A stone well stands at the center, its bucket resting on the lip. The air is quiet, broken only by the occasional sound of a chicken, a distant hammer, wind in the eaves. Geelee's armor shop lies to the west and Perguth's weapon shop to the east. A wider street continues north toward more buildings. To the south, a track leads back toward the countryside.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
        features: { respawn: { enabled: true, servedAreas: ['Hearthstead Loop', 'Hearthstead Wilds'] } },
      },

      // --- Street above S ---
      streetRoom('hs_hamlet_st1', 'Hearthstead Main Street'),

      // --- Healer (north of st1) ---
      {
        tag: 'hs_hamlet_h',
        name: 'Hearthstead\'s Mission',
        description: `A modest building with a painted sign above the door. Inside, bundles of dried herbs hang from the rafters and the scent of lavender and chamomile fills the air. A wooden counter separates the front room from shelves crowded with clay jars, glass bottles, and neatly labeled pouches. A curtained doorway leads to a back room where a cot is visible. The mission provides healing and spiritual comfort to the people of Hearthstead.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },

      // --- Armor shop (west of S) ---
      {
        tag: 'hs_hamlet_a',
        name: 'Geelee\'s Training Armor',
        description: `A small workshop run by old Geelee, Hearthstead's only source of protective gear. Padded jerkins and simple leather pieces hang from wooden pegs along the walls. A workbench holds scraps of fabric, needles, and heavy thread. The shop specializes in practical, affordable protection. Nothing fancy, but enough to turn a glancing blow. The smell of leather and linseed oil fills the space.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },

      // --- Weapons shop (east of S) ---
      {
        tag: 'hs_hamlet_w',
        name: 'Perguth\'s Training Weapons',
        description: `Perguth's workshop is a lean-to attached to a small forge. Simple training weapons are displayed on a rack: clubs, daggers, short swords, and a few battered spears. The metalwork is plain but serviceable. The forge is small but well-maintained, its bellows patched and its anvil worn smooth from years of use. Heat radiates from the coals. Perguth supplies Hearthstead's travelers with practical arms for the road ahead.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },

      // --- Spell shop (west of st1) ---
      {
        tag: 'hs_hamlet_e',
        name: 'Zifnab\'s House of Magic',
        description: `A cramped cottage bearing a crooked sign that reads "Zifnab's House of Magic." Inside, it smells of candle wax and old paper. Shelves line every wall, crammed with scrolls, small books, and bundles of dried ingredients. A glass case on the counter holds a few glowing vials and inscribed stones. Zifnab's apprentice minds the shop, dealing in minor enchantments and basic spell instruction. A cat sleeps on a pile of parchment.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },

      // --- Inn rooms (east of st1) ---
      {
        tag: 'hs_hamlet_i1',
        name: 'Hearthstead Inn, Common Room',
        description: `The front room of Hearthstead's only inn. A stone fireplace dominates one wall, its mantel decorated with dried flowers and a tarnished copper mug. Rough wooden tables and benches fill the space. The bar is a plank laid across two barrels, behind which shelves hold a modest selection of drink. The room is warm and smells of woodsmoke and stew. A doorway leads east to more of the inn.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },
      {
        tag: 'hs_hamlet_i2',
        name: 'Hearthstead Inn, Back Hall',
        description: `A narrow hallway connecting the common room to the inn's back rooms. The floor is worn smooth. Hooks on the wall hold cloaks and a battered lantern. A stairway leads to a room above, and a curtained archway opens to the kitchen. The sounds of the common room are muffled here. Clinking cups, low conversation.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },
      {
        tag: 'hs_hamlet_i3',
        name: 'Hearthstead Inn, Back Room',
        description: `A small but clean room at the back of the inn. A narrow bed with a wool blanket, a three-legged stool, and a basin on a shelf make up the furnishings. A small window looks out over Hearthstead's rooftops. The room is quiet, the sounds from the common room muffled by the thick walls. It smells faintly of lavender from a dried sprig tucked behind the basin.`,
        area: AREA_SAFE,
        terrain: 'outdoor',
      },

      // ================================================================
      // WILDS FOREST — 26 rooms (quest area north of G)
      // Area: Hearthstead Wilds (monsters roam)
      // ================================================================

      // --- wilds_1: Overgrown Trailhead (entry from G via `go path`) ---
      {
        tag: 'hs_wilds_1',
        name: 'Overgrown Trailhead',
        description: `The narrow trail emerges from the brush into a small clearing at the forest's edge. The canopy closes overhead, filtering the light to green-gold dimness. The air is cooler here, damp and earthy. The path continues north, forking almost immediately into diverging trails that disappear into the undergrowth. Behind, the trail leads back south through dense brush toward the Hearthstead loop trail.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },

      // --- wilds_2 through wilds_15: branching forest trails ---
      forestRoom('hs_wilds_2'),
      forestRoom('hs_wilds_3'),
      forestRoom('hs_wilds_4'),
      forestRoom('hs_wilds_5'),
      forestRoom('hs_wilds_6'),
      forestRoom('hs_wilds_7'),
      forestRoom('hs_wilds_8'),
      forestRoom('hs_wilds_9'),
      forestRoom('hs_wilds_10'),
      forestRoom('hs_wilds_11'),
      forestRoom('hs_wilds_12'),
      forestRoom('hs_wilds_13'),
      forestRoom('hs_wilds_14'),
      forestRoom('hs_wilds_15'),

      // --- Hub row (line 102): 5 E/W rooms ---
      {
        tag: 'hs_wilds_16',
        name: 'Scenic Overlook',
        description: `The trail ends at a rocky outcrop overlooking the western coast. Through a gap in the trees, the sea stretches to the horizon, grey-blue and restless. Arindale's walls are faintly visible to the southwest, tiny at this distance. The rock is flat and sun-warmed, scattered with old bird droppings. This is a dead end. The only path leads back east.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },
      forestRoom('hs_wilds_17'),
      forestRoom('hs_wilds_18'),
      forestRoom('hs_wilds_19'),
      {
        tag: 'hs_wilds_20',
        name: 'Abandoned Campsite',
        description: `The trail widens into a small clearing where someone once made camp. A ring of fire-blackened stones surrounds a pit of cold ashes. A rotting bedroll lies half-unrolled nearby, and an empty waterskin hangs from a branch. Whoever camped here left in a hurry, or didn't leave willingly. The site has an uneasy stillness. This is a dead end; the path leads back west.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },

      // --- Upper forest (lines 98-100) ---
      forestRoom('hs_wilds_21'),
      forestRoom('hs_wilds_22'),
      forestRoom('hs_wilds_23'),
      forestRoom('hs_wilds_24'),

      // --- Forest edge (just south of cave entrance) ---
      {
        tag: 'hs_wilds_25',
        name: 'Forest Edge',
        description: `The trees thin here, giving way to rocky ground and scrubby bushes. The air changes, growing cooler and carrying a faint mineral smell from somewhere ahead. The forest canopy opens to grey sky. To the north, the hillside rises steeply, and a dark opening gapes in the rock face. Claw marks score the stone around the entrance. The surrounding trees have been stripped of bark at head height.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },

      // --- Overgrown Path (side trail off room 24) ---
      {
        tag: 'hs_wilds_26',
        name: 'Overgrown Path',
        description: `A narrow side trail nearly swallowed by undergrowth. Brambles and ferns press close, forcing a slow push through tangled vegetation. The ground is soft and damp, scattered with fallen leaves that muffle every footstep. Animal tracks cross the path. Something came this way recently. The trail feels forgotten, as if it once led somewhere but has been abandoned to the forest.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },

      // ================================================================
      // WILDS CAVE — 20 rooms (underground dungeon)
      // Area: Hearthstead Wilds (monsters roam)
      // ================================================================

      // --- Cave entrance (outdoor) ---
      {
        tag: 'hs_cave_c',
        name: 'Gaping Cave Mouth',
        description: `A wide, dark opening in the hillside, framed by rough stone and curtained with hanging moss. The cave mouth is large enough to walk through upright, its edges scored with deep claw marks, old and new overlapping. A draft of cold, damp air pushes outward, carrying the smell of wet stone and something rank underneath. Bones of rabbit, deer, and something larger are scattered near the entrance. The darkness inside is absolute.`,
        area: AREA_WILDS,
        terrain: 'outdoor',
      },

      // --- Western branch (main path toward bear) ---
      caveRoom('hs_cave_1'),
      caveRoom('hs_cave_2'),
      caveRoom('hs_cave_3'),
      caveRoom('hs_cave_4'),
      caveRoom('hs_cave_5'),
      caveRoom('hs_cave_6'),

      // --- Cross-connection rooms ---
      caveRoom('hs_cave_7'),
      caveRoom('hs_cave_8'),

      // --- Eastern branch (toward goblin) ---
      caveRoom('hs_cave_9'),
      caveRoom('hs_cave_10'),
      caveRoom('hs_cave_11'),
      caveRoom('hs_cave_12'),
      caveRoom('hs_cave_13'),
      caveRoom('hs_cave_14'),
      caveRoom('hs_cave_15'),
      caveRoom('hs_cave_16'),
      caveRoom('hs_cave_17'),

      // --- Goblin's Den (mini-boss) ---
      {
        tag: 'hs_cave_k',
        name: "Goblin's Den",
        description: `A foul-smelling chamber littered with crude furnishings. A pile of stained rags serves as a bed, a collection of stolen trinkets is heaped in one corner, and gnawed bones are scattered across the floor. The walls are smeared with filth and scratched with crude markings. The air is thick with the stench of unwashed goblin and rotten food. Something has been living here for a long time, and it has no intention of sharing.`,
        area: AREA_WILDS,
        terrain: 'underground',
      },

      // --- Bone-Littered Burrow (boss) ---
      {
        tag: 'hs_cave_b',
        name: "Bone-Littered Burrow",
        description: `A large natural chamber at the deepest point of the cave. The floor is carpeted with a nest of shredded bark, matted fur, and bones, the accumulated debris of a large predator's den. The walls bear deep gouges from massive claws. A strange, dark growth clings to the stone in patches, pulsing faintly with a sickly luminescence. The air is thick with animal musk and a sweet, rotten smell that makes the eyes water. Whatever lives here is large, aggressive, and very ill.`,
        area: AREA_WILDS,
        terrain: 'underground',
      },
    ],

    exits: [
      // ================================================================
      // ROAD EXITS
      // ================================================================

      // --- Arindale connection (ew_0_3_2 = Harbor Rd, 2W of Eastwall St) ---
      { fromTag: 'ew_0_3_2', toTag: 'hs_road_1', direction: 'northeast' },
      { fromTag: 'hs_road_1', toTag: 'ew_0_3_2', direction: 'southwest' },

      // --- Road chain (NE from Arindale toward river) ---
      { fromTag: 'hs_road_1', toTag: 'hs_road_2', direction: 'northeast' },
      { fromTag: 'hs_road_2', toTag: 'hs_road_1', direction: 'southwest' },
      { fromTag: 'hs_road_2', toTag: 'hs_road_r', direction: 'northeast' },
      { fromTag: 'hs_road_r', toTag: 'hs_road_2', direction: 'southwest' },

      // --- River crossing (R ↔ N via swim river triggered passage) ---
      { fromTag: 'hs_road_r', toTag: 'hs_road_n', direction: 'north' },
      { fromTag: 'hs_road_n', toTag: 'hs_road_r', direction: 'south' },

      // --- Road chain (NE from river toward loop) ---
      { fromTag: 'hs_road_n', toTag: 'hs_road_5', direction: 'northeast' },
      { fromTag: 'hs_road_5', toTag: 'hs_road_n', direction: 'southwest' },
      { fromTag: 'hs_road_5', toTag: 'hs_road_6', direction: 'northeast' },
      { fromTag: 'hs_road_6', toTag: 'hs_road_5', direction: 'southwest' },

      // --- Road to loop crossing ---
      { fromTag: 'hs_road_6', toTag: 'hs_loop_l', direction: 'north' },
      { fromTag: 'hs_loop_l', toTag: 'hs_road_6', direction: 'south' },

      // ================================================================
      // LOOP EXITS
      // ================================================================

      // --- Bottom row: L---*---*---* ---
      { fromTag: 'hs_loop_l', toTag: 'hs_loop_1', direction: 'east' },
      { fromTag: 'hs_loop_1', toTag: 'hs_loop_l', direction: 'west' },
      { fromTag: 'hs_loop_1', toTag: 'hs_loop_2', direction: 'east' },
      { fromTag: 'hs_loop_2', toTag: 'hs_loop_1', direction: 'west' },
      { fromTag: 'hs_loop_2', toTag: 'hs_loop_3', direction: 'east' },
      { fromTag: 'hs_loop_3', toTag: 'hs_loop_2', direction: 'west' },

      // --- Left side: L NW up to loop_11 ---
      { fromTag: 'hs_loop_l', toTag: 'hs_loop_4', direction: 'northwest' },
      { fromTag: 'hs_loop_4', toTag: 'hs_loop_l', direction: 'southeast' },
      { fromTag: 'hs_loop_4', toTag: 'hs_loop_5', direction: 'northwest' },
      { fromTag: 'hs_loop_5', toTag: 'hs_loop_4', direction: 'southeast' },
      { fromTag: 'hs_loop_5', toTag: 'hs_loop_6', direction: 'west' },
      { fromTag: 'hs_loop_6', toTag: 'hs_loop_5', direction: 'east' },
      { fromTag: 'hs_loop_6', toTag: 'hs_loop_7', direction: 'north' },
      { fromTag: 'hs_loop_7', toTag: 'hs_loop_6', direction: 'south' },
      { fromTag: 'hs_loop_7', toTag: 'hs_loop_8', direction: 'northwest' },
      { fromTag: 'hs_loop_8', toTag: 'hs_loop_7', direction: 'southeast' },
      { fromTag: 'hs_loop_8', toTag: 'hs_loop_9', direction: 'north' },
      { fromTag: 'hs_loop_9', toTag: 'hs_loop_8', direction: 'south' },
      { fromTag: 'hs_loop_9', toTag: 'hs_loop_10', direction: 'northeast' },
      { fromTag: 'hs_loop_10', toTag: 'hs_loop_9', direction: 'southwest' },
      { fromTag: 'hs_loop_10', toTag: 'hs_loop_11', direction: 'northeast' },
      { fromTag: 'hs_loop_11', toTag: 'hs_loop_10', direction: 'southwest' },

      // --- Top left: loop_11 E to loop_13 ---
      { fromTag: 'hs_loop_11', toTag: 'hs_loop_12', direction: 'east' },
      { fromTag: 'hs_loop_12', toTag: 'hs_loop_11', direction: 'west' },
      { fromTag: 'hs_loop_12', toTag: 'hs_loop_13', direction: 'east' },
      { fromTag: 'hs_loop_13', toTag: 'hs_loop_12', direction: 'west' },

      // --- Bridge: loop_13 NE to loop_14 ---
      { fromTag: 'hs_loop_13', toTag: 'hs_loop_14', direction: 'northeast' },
      { fromTag: 'hs_loop_14', toTag: 'hs_loop_13', direction: 'southwest' },

      // --- G: loop_14 N to loop_g ---
      { fromTag: 'hs_loop_14', toTag: 'hs_loop_g', direction: 'north' },
      { fromTag: 'hs_loop_g', toTag: 'hs_loop_14', direction: 'south' },

      // --- Bridge: loop_14 SE to loop_15 ---
      { fromTag: 'hs_loop_14', toTag: 'hs_loop_15', direction: 'southeast' },
      { fromTag: 'hs_loop_15', toTag: 'hs_loop_14', direction: 'northwest' },

      // --- Top right: loop_15 E to loop_17 ---
      { fromTag: 'hs_loop_15', toTag: 'hs_loop_16', direction: 'east' },
      { fromTag: 'hs_loop_16', toTag: 'hs_loop_15', direction: 'west' },
      { fromTag: 'hs_loop_16', toTag: 'hs_loop_17', direction: 'east' },
      { fromTag: 'hs_loop_17', toTag: 'hs_loop_16', direction: 'west' },

      // --- Right side: loop_17 SE down to loop_23 ---
      { fromTag: 'hs_loop_17', toTag: 'hs_loop_18', direction: 'southeast' },
      { fromTag: 'hs_loop_18', toTag: 'hs_loop_17', direction: 'northwest' },
      { fromTag: 'hs_loop_18', toTag: 'hs_loop_19', direction: 'south' },
      { fromTag: 'hs_loop_19', toTag: 'hs_loop_18', direction: 'north' },
      { fromTag: 'hs_loop_19', toTag: 'hs_loop_20', direction: 'south' },
      { fromTag: 'hs_loop_20', toTag: 'hs_loop_19', direction: 'north' },
      { fromTag: 'hs_loop_20', toTag: 'hs_loop_21', direction: 'southwest' },
      { fromTag: 'hs_loop_21', toTag: 'hs_loop_20', direction: 'northeast' },
      { fromTag: 'hs_loop_21', toTag: 'hs_loop_22', direction: 'southwest' },
      { fromTag: 'hs_loop_22', toTag: 'hs_loop_21', direction: 'northeast' },
      { fromTag: 'hs_loop_22', toTag: 'hs_loop_23', direction: 'south' },
      { fromTag: 'hs_loop_23', toTag: 'hs_loop_22', direction: 'north' },

      // --- Close the loop: loop_3 N to loop_23 ---
      { fromTag: 'hs_loop_3', toTag: 'hs_loop_23', direction: 'north' },
      { fromTag: 'hs_loop_23', toTag: 'hs_loop_3', direction: 'south' },

      // ================================================================
      // HAMLET EXITS
      // ================================================================

      // --- Approach from L into hamlet ---
      { fromTag: 'hs_loop_l', toTag: 'hs_hamlet_app1', direction: 'northeast' },
      { fromTag: 'hs_hamlet_app1', toTag: 'hs_loop_l', direction: 'southwest' },
      { fromTag: 'hs_hamlet_app1', toTag: 'hs_hamlet_app2', direction: 'northeast' },
      { fromTag: 'hs_hamlet_app2', toTag: 'hs_hamlet_app1', direction: 'southwest' },
      { fromTag: 'hs_hamlet_app2', toTag: 'hs_hamlet_app3', direction: 'north' },
      { fromTag: 'hs_hamlet_app3', toTag: 'hs_hamlet_app2', direction: 'south' },
      { fromTag: 'hs_hamlet_app3', toTag: 'hs_hamlet_s', direction: 'north' },
      { fromTag: 'hs_hamlet_s', toTag: 'hs_hamlet_app3', direction: 'south' },

      // --- Spawn row: A---S---W ---
      { fromTag: 'hs_hamlet_s', toTag: 'hs_hamlet_a', direction: 'west' },
      { fromTag: 'hs_hamlet_a', toTag: 'hs_hamlet_s', direction: 'east' },
      { fromTag: 'hs_hamlet_s', toTag: 'hs_hamlet_w', direction: 'east' },
      { fromTag: 'hs_hamlet_w', toTag: 'hs_hamlet_s', direction: 'west' },

      // --- S north to st1 ---
      { fromTag: 'hs_hamlet_s', toTag: 'hs_hamlet_st1', direction: 'north' },
      { fromTag: 'hs_hamlet_st1', toTag: 'hs_hamlet_s', direction: 'south' },

      // --- Street row: E---st1---I1---I2 ---
      { fromTag: 'hs_hamlet_st1', toTag: 'hs_hamlet_e', direction: 'west' },
      { fromTag: 'hs_hamlet_e', toTag: 'hs_hamlet_st1', direction: 'east' },
      { fromTag: 'hs_hamlet_st1', toTag: 'hs_hamlet_i1', direction: 'east' },
      { fromTag: 'hs_hamlet_i1', toTag: 'hs_hamlet_st1', direction: 'west' },
      { fromTag: 'hs_hamlet_i1', toTag: 'hs_hamlet_i2', direction: 'east' },
      { fromTag: 'hs_hamlet_i2', toTag: 'hs_hamlet_i1', direction: 'west' },

      // --- I2 north to I3 ---
      { fromTag: 'hs_hamlet_i2', toTag: 'hs_hamlet_i3', direction: 'north' },
      { fromTag: 'hs_hamlet_i3', toTag: 'hs_hamlet_i2', direction: 'south' },

      // --- st1 north to H ---
      { fromTag: 'hs_hamlet_st1', toTag: 'hs_hamlet_h', direction: 'north' },
      { fromTag: 'hs_hamlet_h', toTag: 'hs_hamlet_st1', direction: 'south' },

      // ================================================================
      // WILDS FOREST EXITS
      // ================================================================

      // --- G north to wilds_1 (via triggered passage `go path`) ---
      { fromTag: 'hs_loop_g', toTag: 'hs_wilds_1', direction: 'north' },
      { fromTag: 'hs_wilds_1', toTag: 'hs_loop_g', direction: 'south' },

      // --- wilds_1 fans out NW and NE ---
      { fromTag: 'hs_wilds_1', toTag: 'hs_wilds_2', direction: 'northwest' },
      { fromTag: 'hs_wilds_2', toTag: 'hs_wilds_1', direction: 'southeast' },
      { fromTag: 'hs_wilds_1', toTag: 'hs_wilds_3', direction: 'northeast' },
      { fromTag: 'hs_wilds_3', toTag: 'hs_wilds_1', direction: 'southwest' },

      // --- wilds_2/3 up to wilds_4/5 ---
      { fromTag: 'hs_wilds_2', toTag: 'hs_wilds_4', direction: 'northwest' },
      { fromTag: 'hs_wilds_4', toTag: 'hs_wilds_2', direction: 'southeast' },
      { fromTag: 'hs_wilds_3', toTag: 'hs_wilds_5', direction: 'northeast' },
      { fromTag: 'hs_wilds_5', toTag: 'hs_wilds_3', direction: 'southwest' },

      // --- wilds_4/5 north to hub trio (wilds_6/7/8) ---
      { fromTag: 'hs_wilds_4', toTag: 'hs_wilds_6', direction: 'north' },
      { fromTag: 'hs_wilds_6', toTag: 'hs_wilds_4', direction: 'south' },
      { fromTag: 'hs_wilds_5', toTag: 'hs_wilds_8', direction: 'north' },
      { fromTag: 'hs_wilds_8', toTag: 'hs_wilds_5', direction: 'south' },

      // --- Hub trio E/W: wilds_6---wilds_7---wilds_8 ---
      { fromTag: 'hs_wilds_6', toTag: 'hs_wilds_7', direction: 'east' },
      { fromTag: 'hs_wilds_7', toTag: 'hs_wilds_6', direction: 'west' },
      { fromTag: 'hs_wilds_7', toTag: 'hs_wilds_8', direction: 'east' },
      { fromTag: 'hs_wilds_8', toTag: 'hs_wilds_7', direction: 'west' },

      // --- Hub trio NW/NE diagonals to wilds_9-12 ---
      { fromTag: 'hs_wilds_6', toTag: 'hs_wilds_9', direction: 'northwest' },
      { fromTag: 'hs_wilds_9', toTag: 'hs_wilds_6', direction: 'southeast' },
      { fromTag: 'hs_wilds_7', toTag: 'hs_wilds_10', direction: 'northwest' },
      { fromTag: 'hs_wilds_10', toTag: 'hs_wilds_7', direction: 'southeast' },
      { fromTag: 'hs_wilds_7', toTag: 'hs_wilds_11', direction: 'northeast' },
      { fromTag: 'hs_wilds_11', toTag: 'hs_wilds_7', direction: 'southwest' },
      { fromTag: 'hs_wilds_8', toTag: 'hs_wilds_12', direction: 'northeast' },
      { fromTag: 'hs_wilds_12', toTag: 'hs_wilds_8', direction: 'southwest' },

      // --- wilds_10 E to wilds_11 ---
      { fromTag: 'hs_wilds_10', toTag: 'hs_wilds_11', direction: 'east' },
      { fromTag: 'hs_wilds_11', toTag: 'hs_wilds_10', direction: 'west' },

      // --- wilds_9-12 NE/NW to wilds_13-15 ---
      { fromTag: 'hs_wilds_9', toTag: 'hs_wilds_13', direction: 'northeast' },
      { fromTag: 'hs_wilds_13', toTag: 'hs_wilds_9', direction: 'southwest' },
      { fromTag: 'hs_wilds_10', toTag: 'hs_wilds_14', direction: 'northeast' },
      { fromTag: 'hs_wilds_14', toTag: 'hs_wilds_10', direction: 'southwest' },
      { fromTag: 'hs_wilds_11', toTag: 'hs_wilds_14', direction: 'northwest' },
      { fromTag: 'hs_wilds_14', toTag: 'hs_wilds_11', direction: 'southeast' },
      { fromTag: 'hs_wilds_12', toTag: 'hs_wilds_15', direction: 'northwest' },
      { fromTag: 'hs_wilds_15', toTag: 'hs_wilds_12', direction: 'southeast' },

      // --- wilds_13-15 north to hub row (wilds_17-19) ---
      { fromTag: 'hs_wilds_13', toTag: 'hs_wilds_17', direction: 'north' },
      { fromTag: 'hs_wilds_17', toTag: 'hs_wilds_13', direction: 'south' },
      { fromTag: 'hs_wilds_14', toTag: 'hs_wilds_18', direction: 'north' },
      { fromTag: 'hs_wilds_18', toTag: 'hs_wilds_14', direction: 'south' },
      { fromTag: 'hs_wilds_15', toTag: 'hs_wilds_19', direction: 'north' },
      { fromTag: 'hs_wilds_19', toTag: 'hs_wilds_15', direction: 'south' },

      // --- Hub row E/W: wilds_16---17---18---19---20 ---
      { fromTag: 'hs_wilds_16', toTag: 'hs_wilds_17', direction: 'east' },
      { fromTag: 'hs_wilds_17', toTag: 'hs_wilds_16', direction: 'west' },
      { fromTag: 'hs_wilds_17', toTag: 'hs_wilds_18', direction: 'east' },
      { fromTag: 'hs_wilds_18', toTag: 'hs_wilds_17', direction: 'west' },
      { fromTag: 'hs_wilds_18', toTag: 'hs_wilds_19', direction: 'east' },
      { fromTag: 'hs_wilds_19', toTag: 'hs_wilds_18', direction: 'west' },
      { fromTag: 'hs_wilds_19', toTag: 'hs_wilds_20', direction: 'east' },
      { fromTag: 'hs_wilds_20', toTag: 'hs_wilds_19', direction: 'west' },

      // --- Hub row NE/SE to wilds_21/22 (line 100) ---
      { fromTag: 'hs_wilds_17', toTag: 'hs_wilds_21', direction: 'northeast' },
      { fromTag: 'hs_wilds_21', toTag: 'hs_wilds_17', direction: 'southwest' },
      { fromTag: 'hs_wilds_18', toTag: 'hs_wilds_21', direction: 'northwest' },
      { fromTag: 'hs_wilds_21', toTag: 'hs_wilds_18', direction: 'southeast' },
      { fromTag: 'hs_wilds_18', toTag: 'hs_wilds_22', direction: 'northeast' },
      { fromTag: 'hs_wilds_22', toTag: 'hs_wilds_18', direction: 'southwest' },
      { fromTag: 'hs_wilds_19', toTag: 'hs_wilds_22', direction: 'northwest' },
      { fromTag: 'hs_wilds_22', toTag: 'hs_wilds_19', direction: 'southeast' },

      // --- wilds_21/22 to wilds_23/24 (line 98) ---
      { fromTag: 'hs_wilds_21', toTag: 'hs_wilds_23', direction: 'northwest' },
      { fromTag: 'hs_wilds_23', toTag: 'hs_wilds_21', direction: 'southeast' },
      { fromTag: 'hs_wilds_21', toTag: 'hs_wilds_24', direction: 'northeast' },
      { fromTag: 'hs_wilds_24', toTag: 'hs_wilds_21', direction: 'southwest' },
      { fromTag: 'hs_wilds_22', toTag: 'hs_wilds_24', direction: 'northwest' },
      { fromTag: 'hs_wilds_24', toTag: 'hs_wilds_22', direction: 'southeast' },

      // --- wilds_23 E to wilds_24 ---
      { fromTag: 'hs_wilds_23', toTag: 'hs_wilds_24', direction: 'east' },
      { fromTag: 'hs_wilds_24', toTag: 'hs_wilds_23', direction: 'west' },

      // --- wilds_24 north to wilds_25 (Forest Edge) ---
      { fromTag: 'hs_wilds_24', toTag: 'hs_wilds_25', direction: 'north' },
      { fromTag: 'hs_wilds_25', toTag: 'hs_wilds_24', direction: 'south' },

      // --- wilds_25 north to cave_c ---
      { fromTag: 'hs_wilds_25', toTag: 'hs_cave_c', direction: 'north' },
      { fromTag: 'hs_cave_c', toTag: 'hs_wilds_25', direction: 'south' },

      // --- wilds_26 (Overgrown Path, side trail off wilds_24) ---
      { fromTag: 'hs_wilds_24', toTag: 'hs_wilds_26', direction: 'east' },
      { fromTag: 'hs_wilds_26', toTag: 'hs_wilds_24', direction: 'west' },

      // ================================================================
      // WILDS CAVE EXITS
      // ================================================================

      // --- Cave entrance fans out NW/NE ---
      { fromTag: 'hs_cave_c', toTag: 'hs_cave_1', direction: 'northwest' },
      { fromTag: 'hs_cave_1', toTag: 'hs_cave_c', direction: 'southeast' },
      { fromTag: 'hs_cave_c', toTag: 'hs_cave_9', direction: 'northeast' },
      { fromTag: 'hs_cave_9', toTag: 'hs_cave_c', direction: 'southwest' },

      // --- Western branch: cave_1 NW toward bear ---
      { fromTag: 'hs_cave_1', toTag: 'hs_cave_2', direction: 'northwest' },
      { fromTag: 'hs_cave_2', toTag: 'hs_cave_1', direction: 'southeast' },
      { fromTag: 'hs_cave_2', toTag: 'hs_cave_3', direction: 'north' },
      { fromTag: 'hs_cave_3', toTag: 'hs_cave_2', direction: 'south' },
      { fromTag: 'hs_cave_3', toTag: 'hs_cave_4', direction: 'northwest' },
      { fromTag: 'hs_cave_4', toTag: 'hs_cave_3', direction: 'southeast' },
      { fromTag: 'hs_cave_3', toTag: 'hs_cave_5', direction: 'northeast' },
      { fromTag: 'hs_cave_5', toTag: 'hs_cave_3', direction: 'southwest' },
      { fromTag: 'hs_cave_4', toTag: 'hs_cave_6', direction: 'north' },
      { fromTag: 'hs_cave_6', toTag: 'hs_cave_4', direction: 'south' },
      { fromTag: 'hs_cave_6', toTag: 'hs_cave_b', direction: 'northeast' },
      { fromTag: 'hs_cave_b', toTag: 'hs_cave_6', direction: 'southwest' },

      // --- Cross-connection: cave_5 SE to cave_7, cave_7 S to cave_8 ---
      { fromTag: 'hs_cave_5', toTag: 'hs_cave_7', direction: 'southeast' },
      { fromTag: 'hs_cave_7', toTag: 'hs_cave_5', direction: 'northwest' },
      { fromTag: 'hs_cave_7', toTag: 'hs_cave_8', direction: 'south' },
      { fromTag: 'hs_cave_8', toTag: 'hs_cave_7', direction: 'north' },

      // --- Cross-connection: cave_8 SE to cave_9 ---
      { fromTag: 'hs_cave_8', toTag: 'hs_cave_9', direction: 'southeast' },
      { fromTag: 'hs_cave_9', toTag: 'hs_cave_8', direction: 'northwest' },

      // --- Cross-connection: cave_5 NE to cave_17 ---
      { fromTag: 'hs_cave_5', toTag: 'hs_cave_17', direction: 'northeast' },
      { fromTag: 'hs_cave_17', toTag: 'hs_cave_5', direction: 'southwest' },

      // --- Eastern branch from cave_9: SE to cave_10/11 ---
      { fromTag: 'hs_cave_9', toTag: 'hs_cave_10', direction: 'southeast' },
      { fromTag: 'hs_cave_10', toTag: 'hs_cave_9', direction: 'northwest' },
      { fromTag: 'hs_cave_10', toTag: 'hs_cave_11', direction: 'east' },
      { fromTag: 'hs_cave_11', toTag: 'hs_cave_10', direction: 'west' },
      { fromTag: 'hs_cave_11', toTag: 'hs_cave_12', direction: 'northwest' },
      { fromTag: 'hs_cave_12', toTag: 'hs_cave_11', direction: 'southeast' },
      { fromTag: 'hs_cave_12', toTag: 'hs_cave_13', direction: 'northeast' },
      { fromTag: 'hs_cave_13', toTag: 'hs_cave_12', direction: 'southwest' },
      { fromTag: 'hs_cave_13', toTag: 'hs_cave_k', direction: 'east' },
      { fromTag: 'hs_cave_k', toTag: 'hs_cave_13', direction: 'west' },

      // --- Eastern upper branch: cave_13 NW up toward cave_17 ---
      { fromTag: 'hs_cave_13', toTag: 'hs_cave_14', direction: 'northwest' },
      { fromTag: 'hs_cave_14', toTag: 'hs_cave_13', direction: 'southeast' },
      { fromTag: 'hs_cave_14', toTag: 'hs_cave_15', direction: 'north' },
      { fromTag: 'hs_cave_15', toTag: 'hs_cave_14', direction: 'south' },
      { fromTag: 'hs_cave_15', toTag: 'hs_cave_16', direction: 'northwest' },
      { fromTag: 'hs_cave_16', toTag: 'hs_cave_15', direction: 'southeast' },
      { fromTag: 'hs_cave_16', toTag: 'hs_cave_17', direction: 'west' },
      { fromTag: 'hs_cave_17', toTag: 'hs_cave_16', direction: 'east' },
    ],

    doors: [
      // --- Swim river: south bank (R) to north bank (N) ---
      {
        name: 'river',
        doorType: 'triggered_passageway',
        entryTag: 'hs_road_r',
        entryDirection: 'north',
        exitTag: 'hs_road_n',
        exitDirection: 'south',
        defaultState: 'closed',
        autoResetSeconds: 10,
        isHidden: true,
        triggerText: 'swim river',
        passageMessageSelf: 'You wade into the river and swim across to the far bank.',
        passageMessageRoom: '{player} wades into the river and swims across.',
      },
      // --- Swim river: north bank (N) to south bank (R) ---
      {
        name: 'river',
        doorType: 'triggered_passageway',
        entryTag: 'hs_road_n',
        entryDirection: 'south',
        exitTag: 'hs_road_r',
        exitDirection: 'north',
        defaultState: 'closed',
        autoResetSeconds: 10,
        isHidden: true,
        triggerText: 'swim river',
        passageMessageSelf: 'You wade into the river and swim across to the far bank.',
        passageMessageRoom: '{player} wades into the river and swims across.',
      },
      // --- Go path: G to wilds_1 ---
      {
        name: 'overgrown path',
        doorType: 'triggered_passageway',
        entryTag: 'hs_loop_g',
        entryDirection: 'north',
        exitTag: 'hs_wilds_1',
        exitDirection: 'south',
        defaultState: 'closed',
        autoResetSeconds: 10,
        isHidden: true,
        triggerText: 'go path',
        passageMessageSelf: 'You push through the overgrown brush and find a narrow trail leading north into the forest.',
        passageMessageRoom: '{player} pushes through the undergrowth and disappears into the forest.',
      },
    ],
  };
}
