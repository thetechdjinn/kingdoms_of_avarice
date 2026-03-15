/**
 * Description pools for Hearthstead area rooms.
 * Uses deterministic hash selection from arindale descriptions.
 *
 * Sections:
 *   road     — Path between Arindale and Hearthstead (outdoor)
 *   loop     — Battle loop encircling Hearthstead (outdoor)
 *   hamlet   — Village street and approach (outdoor)
 *   forest   — Hearthstead Wilds forest trails (outdoor)
 *   cave     — Hearthstead Wilds cave tunnels (underground)
 */
import { hashTag, pick } from '../arindale/descriptions.js';

// ── Road descriptions ────────────────────────────────────────────────

const roadDescriptions = [
  `A well-worn dirt path cuts through rolling grassland. Wagon ruts and footprints mark the packed earth, evidence of regular traffic between Hearthstead and the city. Wildflowers grow along the edges where the grass hasn't been trampled flat.`,
  `The road follows a gentle rise through open country. Low stone walls border the path in places, remnants of old field boundaries now overgrown with moss and creeping vines. The air smells of cut grass and distant salt.`,
  `A stretch of coastal road with views of the sea to the north. The path is firm and well-maintained, bordered by scrubby bushes that lean away from the prevailing wind. Gulls wheel overhead, their cries carrying on the breeze.`,
  `The road narrows here, hemmed in by tall grass on both sides. The ground is slightly soft underfoot where recent rain has pooled in the wagon ruts. A wooden marker post leans at an angle, its painted directions long faded.`,
  `A straight section of road across flat ground. The path has been reinforced with gravel in places where mud would otherwise swallow boots and wheels alike. Daisies and clover push up between the stones.`,
  `The path curves gently around a low hillock covered in wildflowers. From the slight elevation, Hearthstead's rooftops are visible to the northeast, thin wisps of chimney smoke rising into the sky.`,
];

// ── Loop descriptions ────────────────────────────────────────────────

const loopDescriptions = [
  `A dirt trail winds through scrubby grassland at the edge of Hearthstead. The grass is tall here, waist-high in places, and the path is barely wide enough for two to walk abreast. Insects buzz in the warm air.`,
  `The trail passes through a stand of young birch trees, their white bark peeling in papery strips. Dappled light filters through the canopy. Animal tracks cross the path. Rabbits, perhaps deer.`,
  `A section of trail along a low ridge overlooking the fields around Hearthstead. The ground is rocky and uneven, with exposed tree roots snaking across the path. The breeze carries the smell of earth and growing things.`,
  `The path descends into a shallow depression where water collects after rain. The ground is soft and muddy, the grass replaced by reeds and rushes. Frogs scatter at the sound of footsteps.`,
  `A meadow clearing where the trail widens briefly before narrowing again. Wildflowers blanket the ground in patches of yellow and purple. A large flat rock beside the path looks like it has served as a rest stop for generations.`,
  `The trail passes through a thicket of hawthorn and blackberry bushes. Thorny branches arch overhead, forming a natural tunnel. The berries are small and hard, not yet ripe. Bird nests hide in the dense tangles.`,
  `Open ground with a clear view of Hearthstead below. The trail is well-trodden here, the earth packed hard by years of use. A wooden fence post marks the boundary between the trail and a farmer's field, its top worn smooth.`,
  `The path follows the edge of a shallow stream that trickles through a rocky bed. The water is clear and cold, barely ankle-deep. Mossy stones line the banks. The stream probably feeds Hearthstead's wells.`,
  `A stretch of trail through an old orchard, the fruit trees unpruned and growing wild. Gnarled branches hang low over the path, heavy with small green apples. Fallen fruit rots in the grass, attracting wasps.`,
  `The trail climbs a gentle slope through tall grass and scattered boulders. From the top, the path splits. One way continues around Hearthstead, another disappears into the brush. Wind whispers through the grass.`,
];

// ── Hamlet descriptions ──────────────────────────────────────────────

const hamletStreetDescriptions = [
  `A dirt lane runs through the heart of Hearthstead, lined with a few modest buildings. The road is swept clean, bordered by low stone walls and wooden fences. Flower boxes sit beneath some windows, geraniums bright against weathered wood.`,
  `Hearthstead's main street is quiet and unhurried. Cobblestones give way to packed earth, and the buildings are simple: whitewashed walls, thatched roofs, shuttered windows. Chickens peck in the dust near a water trough.`,
  `A wide spot in Hearthstead road where a few wooden benches face each other under the shade of an old oak tree. This seems to be where villagers gather to talk. A notice board stands nearby, its surface bare.`,
  `The lane narrows between two buildings, their eaves almost touching overhead. The smell of bread baking drifts from somewhere nearby. A cat watches from a windowsill, its tail flicking lazily.`,
];

const hamletApproachDescriptions = [
  `A path leading from the surrounding countryside toward the cluster of buildings that make up Hearthstead. The trail is well-trodden and easy to follow. Ahead, chimney smoke rises above the rooftops.`,
  `The approach to Hearthstead passes between low hedgerows that have been neatly trimmed. Beyond the hedges, small gardens and animal pens border the path. The sounds of the village grow louder: voices, a hammer on metal.`,
  `A gentle slope leading up toward Hearthstead. The path widens here, the grass worn away by years of foot traffic. A wooden sign has been planted at the roadside, though the writing on it has faded to near-illegibility.`,
];

// ── Forest descriptions (Hearthstead Wilds) ──────────────────────────

const forestDescriptions = [
  `The forest trail is narrow and hemmed in by undergrowth. Ferns and brambles press close on both sides, their fronds brushing against anyone who passes. The canopy overhead filters the light to a green-gold dimness.`,
  `A stretch of woodland where the trees grow thick and old. Their trunks are wide, bark rough and deeply furrowed. Moss covers everything: the ground, the roots, the lower branches. The air is damp and smells of decay.`,
  `The path winds between towering oaks, their branches interlocking overhead to form a living ceiling. Very little light reaches the forest floor. The undergrowth is sparse here, just dead leaves and pale mushrooms.`,
  `A section of trail through mixed woodland. Birch, oak, and ash grow together, their different heights creating a layered canopy. Shafts of light angle through gaps in the leaves, illuminating drifting motes of pollen.`,
  `The forest floor here is carpeted in soft moss that muffles every footstep. The trees are smaller but grow close together, their thin trunks forming a natural fence. Spider webs stretch between the branches, catching the light.`,
  `A dip in the trail where water has collected in a shallow, muddy pool. Animal tracks cluster around the edges: deer, fox, something larger with heavy paw prints. The mud smells earthy and rich.`,
  `The path crosses a dry streambed, the stones smooth and pale from years of flowing water. The stream has recently dried up. The banks are still damp, and withered watercress clings to the rocks.`,
  `A clearing in the trees where a massive oak has fallen, tearing a gap in the canopy. Sunlight pours through the opening, and new growth has erupted from the forest floor: saplings, wildflowers, thick grass. The fallen trunk is covered in shelf fungi.`,
  `The trail passes through a grove of ancient trees, their roots rising from the earth in gnarled arches. The spaces between the roots form natural shelters, some deep enough to crawl into. Leaves rustle overhead in a breeze that doesn't reach the ground.`,
  `A stretch of forest where the trees are visibly unhealthy. Bark peels from the trunks in long strips, and the leaves are yellowed and spotted. A faint, sour smell hangs in the air. Something is wrong with this part of the woods.`,
];

// ── Cave descriptions (Hearthstead Wilds) ────────────────────────────

const caveDescriptions = [
  `A narrow passage carved through rough stone. The walls are damp to the touch, slick with condensation and the faint residue of minerals. The ceiling is low enough to force a crouch in places. Water drips somewhere ahead.`,
  `The tunnel widens slightly here, the rough stone walls giving way to a small natural chamber. The floor is uneven, scattered with loose rocks and patches of slick mud. The air is cool and still.`,
  `A twisting passage that turns sharply, the stone walls bearing deep scratches. Claw marks, scored into the rock by something large and powerful. The marks are old, the edges worn smooth, but fresh scrapes overlay them.`,
  `The cave narrows to a tight squeeze between two rock walls. The stone is worn smooth here, as if something large passes through regularly. The air smells of damp fur and something rank underneath.`,
  `A stretch of passage where water seeps from the ceiling, forming a shallow stream that runs along the floor. The constant dripping echoes off the walls, making it hard to hear anything else. The stone is stained dark with mineral deposits.`,
  `A wider section of cave where the ceiling rises to a comfortable height. Stalactites hang overhead, some thick as a man's arm. The floor is littered with fallen stone fragments and the scattered bones of small animals.`,
  `The passage slopes downward at a noticeable angle, the floor rough and uneven. Loose gravel shifts underfoot. The air grows warmer and thicker the deeper the passage descends. A faint animal musk taints every breath.`,
  `A junction in the cave where passages branch in different directions. The stone here is lighter in color, veined with quartz that catches any available light. Scratch marks on the walls suggest frequent passage of something with claws.`,
];

// ── Section lookup ───────────────────────────────────────────────────

export type HearthsteadSection = 'road' | 'loop' | 'hamlet_street' | 'hamlet_approach' | 'forest' | 'cave';

const sectionPools: Record<HearthsteadSection, string[]> = {
  road: roadDescriptions,
  loop: loopDescriptions,
  hamlet_street: hamletStreetDescriptions,
  hamlet_approach: hamletApproachDescriptions,
  forest: forestDescriptions,
  cave: caveDescriptions,
};

/** Pick a deterministic description for a Hearthstead room based on section and tag. */
export function hearthsteadDescription(section: HearthsteadSection, tag: string): string {
  return pick(sectionPools[section], tag);
}

// ── Detail pools for environmental flavor ────────────────────────────

const forestDetails = [
  ` A bird calls sharply from somewhere above, a warning cry, repeated three times before falling silent.`,
  ` A patch of mushrooms grows in a ring at the base of a tree, their caps an unhealthy shade of purple.`,
  ` An animal skull lies half-buried in the leaves, picked clean and bleached white by weather.`,
  ` The bark of a nearby tree has been stripped away at waist height, the exposed wood gouged with deep scratches.`,
  ` A tangle of cobwebs stretches between two bushes, thick enough to catch the light. The spider is nowhere to be seen.`,
  ` The smell of something dead drifts from deeper in the undergrowth. Faint but unmistakable.`,
  ` A small cairn of stones has been stacked beside the path, three stones high. Someone marked this spot.`,
  ` Broken branches and trampled undergrowth suggest something large pushed through here recently, ignoring the path entirely.`,
];

const caveDetails = [
  ` A draft of cold air moves through the passage, carrying the smell of wet stone and something organic.`,
  ` The walls here are marked with faint scratches, perhaps natural, perhaps not. They form no recognizable pattern.`,
  ` A pool of water has collected in a depression in the floor, perfectly still and black as ink in the dim light.`,
  ` Bits of animal fur cling to a rough protrusion in the wall where something has squeezed past repeatedly.`,
  ` The echo of footsteps changes here. The space ahead must be larger, or the passage branches somewhere close.`,
  ` A gnawed bone lies in the corner, too large to be a rabbit. Tooth marks score the surface.`,
];

const detailPools: Record<string, string[]> = {
  forest: forestDetails,
  cave: caveDetails,
};

/** Deterministically add a distinctive detail (~40% chance based on tag hash). */
export function maybeAddDetail(desc: string, tag: string, zone: 'forest' | 'cave'): string {
  const h = hashTag(tag + '_hs_detail');
  if (h % 5 >= 2) return desc;
  const pool = detailPools[zone];
  return desc + pick(pool, tag, 13);
}
