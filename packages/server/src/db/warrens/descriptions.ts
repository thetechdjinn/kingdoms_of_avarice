/**
 * Description pools for Warrens of Filth rooms.
 * Uses deterministic hash selection from arindale descriptions.
 */
import { hashTag, pick } from '../arindale/descriptions.js';

// ── Standard passage descriptions (generic warren rooms) ────────────

const passageDescriptions = [
  `A low tunnel carved through crumbling stone and packed earth. The ceiling barely clears head height, and the walls are scarred with claw marks. Rat droppings cover the uneven floor.`,
  `The passage squeezes between gnawed stonework and hard-packed dirt. Tufts of coarse grey fur cling to the rough edges where something large has pushed through repeatedly.`,
  `A cramped burrow with a floor of compacted refuse. The air is thick with the reek of animal waste and rotting food. Small bones crunch underfoot with every step.`,
  `The tunnel walls are a patchwork of chewed stone and bare earth, shored up by the roots of whatever grows far above. The stench is overwhelming — concentrated animal filth in an enclosed space.`,
  `A narrow passage where the original sewer brickwork has been torn apart and burrowed through. The gap between the stones is packed with shredded cloth and matted fur. Something chittered and fell silent as you approached.`,
  `The floor slopes downward through a cramped tunnel. Claw marks groove the walls at every height, layered over each other in decades of scratching. The air barely moves.`,
  `A low-ceilinged passage littered with gnawed bones and scraps of leather. The walls are smooth where countless bodies have brushed past, polished by fur and filth.`,
  `The burrow widens slightly where a section of old stonework has collapsed inward. Refuse fills the gaps — shredded cloth, matted hair, and things too decayed to identify. The reek is eye-watering.`,
];

// ── Scratched corridor descriptions ─────────────────────────────────

const scratchedDescriptions = [
  `Deep claw marks gouge the walls of this corridor, scoring the stone in parallel lines. The scratching is aggressive, territorial — not the idle marks of passing vermin but deliberate claims of ownership.`,
  `The corridor walls are shredded with claw marks from floor to ceiling. The stone is soft enough to score, and generations of rats have left their marks. Dried blood darkens some of the deeper gouges.`,
  `Scratches cover every surface — walls, floor, even the ceiling where something has climbed. The marks are fresh over old, layer upon layer. The stench thickens and the chittering grows louder ahead.`,
  `A corridor gouged with territorial markings. The scratches are deeper here, made by larger claws than the passages behind. Tufts of dark fur are caught in the rough stone.`,
  `The walls are scored with frantic claw marks, as if something was trying to dig through the stone itself. The deepest gouges are at shoulder height — whatever made them was no ordinary rat.`,
  `Parallel scratches rake the tunnel walls, some deep enough to insert a finger. The marks overlap in a frenzied tangle. Faint squeaking echoes from somewhere ahead, then dozens of tiny claws skitter across stone.`,
  `The corridor narrows where the walls have been clawed to rough concavity. Piles of stone dust and shredded mortar line the base of the walls. The rats are reshaping this place to suit themselves.`,
  `Claw marks and gnaw marks compete for space on the tunnel walls. The stone has been worried away until the passage is barely shoulder-width. Rat droppings are thick on the floor, some still fresh.`,
];

// ── Filthy tunnel descriptions ──────────────────────────────────────

const filthyDescriptions = [
  `The tunnel floor is slick with layers of accumulated filth — animal waste, rotting food, and a thick organic slime that defies identification. The stench is so intense it has a physical presence, pressing against the throat.`,
  `A foul passage coated in grime from floor to ceiling. The walls glisten with moisture and something worse. Half-eaten carcasses of smaller creatures lie in the muck, stripped to bone and sinew.`,
  `The filth here is ankle-deep — a churned slurry of waste, fur, and decomposing matter. The footing is treacherous, the smell unbearable. This is the deepest, foulest part of the warren.`,
  `Thick organic muck coats every surface. The tunnel walls weep with condensation that runs in dark rivulets through the grime. The air is so foul it feels solid, coating the inside of the mouth.`,
  `A passage so filthy the original stonework is invisible beneath layers of accumulated waste. The floor squelches with every step. Something large has been using this tunnel regularly — the grime is churned and fresh.`,
  `The tunnel descends through the worst of the warren's filth. Rotting food stores, animal remains, and waste have been dragged and deposited here over months or years. The smell has layers.`,
  `Slick organic residue coats the floor of this tunnel, making every step a negotiation with gravity. The walls are streaked with dark matter best left unexamined. Small eyes reflect from the darkness ahead.`,
  `The foulest depths of the warren. The filth is so thick it has developed its own ecosystem — pale fungi sprout from the muck, and things too small to see crawl through the organic sludge.`,
];

// ── Deep burrow descriptions ────────────────────────────────────────

const deepDescriptions = [
  `The burrow descends into absolute darkness. The air is heavy with animal heat and the concentrated stench of the colony. The scratching of claws on stone is constant, coming from every direction.`,
  `A deep passage where the walls close in and the ceiling drops. The floor is packed hard by the passage of heavy bodies. Something very large lives nearby — the tunnel is shaped by its bulk.`,
  `The burrow narrows to a tight squeeze between gnawed stone and packed earth. The heat of massed bodies warms the stale air. The sounds of the colony are louder here — chittering, gnawing, the rustle of a thousand small movements.`,
  `Deep in the warren, the tunnel walls are smooth with constant use. The air is thick enough to chew. Every surface is warm to the touch, heated by the colony packed into the surrounding chambers.`,
];

// ── Section lookup and helper ───────────────────────────────────────

export type WarrensSection = 'passage' | 'scratched' | 'filthy' | 'deep';

const sectionPools: Record<WarrensSection, string[]> = {
  passage: passageDescriptions,
  scratched: scratchedDescriptions,
  filthy: filthyDescriptions,
  deep: deepDescriptions,
};

/** Pick a deterministic description for a warrens room based on section and tag. */
export function warrensDescription(section: WarrensSection, tag: string): string {
  const pool = sectionPools[section];
  return pick(pool, tag);
}

// ── Distinctive details for warrens rooms ───────────────────────────

const warrensDetails = [
  ` A knot of pale, hairless rat pups squirms in a shallow depression, their mother nowhere in sight.`,
  ` Gnawed bones are stacked in a crude pile against one wall, picked clean and cracked for marrow.`,
  ` A fat rat watches from a ledge, unafraid, its eyes glinting with animal intelligence.`,
  ` Scratching sounds erupt behind the walls, then stop. Then start again, closer.`,
  ` A stolen leather glove lies in the filth, chewed through at the fingers.`,
  ` The corpse of an enormous rat lies in the corner, torn apart by something even larger.`,
  ` Tiny red eyes peer from a crack in the wall — too many to count before they vanish.`,
  ` A rusted iron nail has been dragged here and deposited among other small, shiny objects.`,
];

/** Deterministically add a distinctive detail (1 in 4 chance based on tag hash). */
export function maybeAddWarrensDetail(desc: string, tag: string): string {
  const h = hashTag(tag + '_warrens_detail');
  if (h % 4 !== 0) return desc;
  const detail = pick(warrensDetails, tag, 13);
  return desc + detail;
}
