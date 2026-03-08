/**
 * Description pools for The Iridescent Menagerie rooms.
 * Uses deterministic hash selection from arindale descriptions.
 */
import { hashTag, pick } from '../arindale/descriptions.js';

// ── Outer zone descriptions (rows 0-2: faint contamination, near entrance) ──

const outerDescriptions = [
  `The sewer brickwork here is streaked with faint luminous residue — thin veins of iridescent color bleeding through the mortar. The chemical tang is noticeable but not yet overpowering. Puddles on the floor glow faintly, casting pale reflections onto the low ceiling.`,
  `A tunnel where the original stonework is still recognizable but stained with patches of soft, unnatural light. The air carries a sharp chemical smell, like overturned reagent bottles. Small luminous droplets weep from cracks in the walls.`,
  `The walls of this passage are mottled with iridescent residue, the colors shifting subtly as the eye moves across them. The floor is damp with glowing runoff. Something about the light feels wrong — too steady, too even, without any visible source.`,
  `Faint contamination marks this stretch of tunnel. The brickwork is intact but discolored, stained in bands of pale violet and sickly green. The air has a metallic bite. Luminous puddles collect in the uneven floor, their surfaces still and mirror-bright.`,
  `A low corridor where chemical residue has begun to seep through the stone. The walls are slick with a thin film that catches the light and throws it back in muted rainbow hues. The smell is acrid, tightening the back of the throat.`,
  `The tunnel bricks are edged with faintly glowing residue, as if someone painted the mortar lines with dilute luminescence. The contamination is thin here — a warning of what lies ahead. Small puddles glow weakly on the damp floor.`,
  `A passage where the first signs of contamination are unmistakable. The walls are smeared with iridescent stains that pulse with a barely perceptible rhythm. The air is damp and chemical-sharp. The sewer structure is still intact, but it won't be for long.`,
  `Thin trails of luminous liquid run down the walls from somewhere above, pooling in the cracks between floor stones. The contamination is light but persistent — every surface bears a faint iridescent sheen. The chemical smell hangs in the still air.`,
];

// ── Mid zone descriptions (rows 3-4: heavy contamination) ───────────────

const midDescriptions = [
  `The contamination here is heavy. The walls glow with a steady, sickly light, the original brickwork barely visible beneath thick crusts of iridescent residue. Crystal formations have begun to sprout from the mortar, small but sharp. The chemical vapor is thick enough to taste.`,
  `A passage consumed by alchemical contamination. The walls are warped, the stone softened and reshaped by whatever reagent has saturated it. Clusters of luminous crystals grow from the ceiling like inverted teeth. The air shimmers with suspended particles.`,
  `The tunnel has been transformed by contamination. The floor is glazed with hardened residue, the walls encrusted with crystal growths that pulse with inner light. The chemical vapor is so thick it obscures the far end of the passage. Each breath burns.`,
  `Heavy contamination has remade this section of tunnel. The sewer is barely recognizable — walls bulge with crystal formations, the floor is slick with luminous residue, and the air itself glows faintly. The chemical smell has become a physical presence, pressing against the skin.`,
  `Thick iridescent residue coats every surface, hardened into a glassy shell over the original stonework. Crystal growths jut from the walls at sharp angles, their edges razor-thin and faintly humming. The light here comes from everywhere and nowhere. The air tastes of copper and something worse.`,
  `The tunnel walls are alive with crystalline growth, the contamination having eaten into the stone and replaced it with something luminous and wrong. The floor crunches underfoot — thin crystal plates that shatter and reform. Vapor curls in thick ribbons through the stale air.`,
  `A corridor deep in the contaminated zone. The original sewer architecture is a memory — the walls are sculpted by alchemical residue into smooth, glowing surfaces broken by jutting crystal formations. The air is heavy, syrupy, tasting of metal and ozone.`,
  `The contamination pulses in the walls like a slow heartbeat. Crystal formations have merged into sheets of translucent growth, casting fractured light in every direction. The stone beneath is being consumed, replaced by something that glows and hums. The chemical vapor stings the eyes.`,
];

// ── Inner zone descriptions (rows 5-6: saturated crystallization) ────────

const innerDescriptions = [
  `The tunnel is barely recognizable as a former sewer. Massive crystal formations dominate the passage — jagged spires of luminous growth that force navigation between their razor edges. The glow is intense, almost blinding. A deep hum vibrates through the floor.`,
  `Saturated crystallization has consumed this section entirely. The walls, floor, and ceiling are fused into a single mass of iridescent crystal, carved into a rough passage by the flow of liquid reagent. The light is overwhelming, the air electric with suspended particles.`,
  `A passage through solid crystal. The original stonework is gone, replaced by translucent formations that glow from within with shifting colors. The air hums with a frequency felt in the bones. Walking here feels like walking through the inside of a geode.`,
  `The crystallization is total. Every surface is encrusted with luminous formations — some smooth and flowing, others jagged and sharp as broken glass. The light they emit is so intense it washes out color. The chemical vapor has condensed into a visible haze.`,
  `Massive crystal spires crowd this passage, their surfaces rippling with internal light. The floor is a sheet of fused crystal, slick and treacherous. The hum here is constant and deep, vibrating in the chest. The air tastes of lightning and molten glass.`,
  `The tunnel has become a crystal cavern. Formations the size of a person jut from the walls at wild angles, their facets throwing fractured light in every direction. The original tunnel dimensions are lost beneath the growth. The air is thick with luminous vapor.`,
  `Encrusted crystal covers everything in a dense, glowing layer. The passage narrows where formations have grown inward, leaving barely enough room to squeeze through. The light is painful — pure and intense, casting no shadows. The humming vibration is deafening in the enclosed space.`,
  `A warped tunnel where crystalline contamination has reached its most extreme expression. The formations pulse and shift with visible movement — still growing, still spreading. The air is saturated with reagent vapor, each breath depositing a faint iridescent film on the lips.`,
];

// ── Section lookup and helper ────────────────────────────────────────────

export type MenagerieSection = 'outer' | 'mid' | 'inner';

const sectionPools: Record<MenagerieSection, string[]> = {
  outer: outerDescriptions,
  mid: midDescriptions,
  inner: innerDescriptions,
};

/** Pick a deterministic description for a menagerie room based on section and tag. */
export function menagerieDescription(section: MenagerieSection, tag: string): string {
  const pool = sectionPools[section];
  return pick(pool, tag);
}

// ── Name pools per zone ──────────────────────────────────────────────────

const outerNames = ['Contaminated Tunnel', 'Tainted Passage', 'Glowing Corridor', 'Stained Tunnel'];
const midNames = ['Iridescent Tunnel', 'Shimmering Passage', 'Luminous Corridor', 'Contaminated Chamber'];
const innerNames = ['Crystallized Passage', 'Warped Tunnel', 'Saturated Corridor', 'Encrusted Tunnel'];

const namePools: Record<MenagerieSection, string[]> = {
  outer: outerNames,
  mid: midNames,
  inner: innerNames,
};

/** Pick a deterministic room name for a menagerie room based on section and tag. */
export function menagerieRoomName(section: MenagerieSection, tag: string): string {
  return pick(namePools[section], tag);
}

// ── Distinctive details for menagerie rooms ──────────────────────────────

const outerDetails = [
  ` A dead rat lies in a luminous puddle, its fur stained iridescent. It has been dead a long time but shows no sign of decay.`,
  ` Faint scratch marks on the wall glow where something has exposed the contaminated stone beneath the surface layer.`,
  ` A dripping sound echoes from somewhere ahead — slow, rhythmic, each drop producing a soft flash of light as it hits the floor.`,
  ` A patch of luminous moss clings to the ceiling, pulsing with a slow, organic rhythm unlike the steady glow of the chemical residue.`,
  ` The remains of a leather satchel lie in the corner, its contents spilled — empty vials, a rusted tong, and a journal too water-damaged to read.`,
  ` A thin crack in the wall leaks a steady trickle of glowing liquid, forming a luminous rivulet that follows the floor's slope into darkness.`,
  ` Something has scratched a crude symbol into the contaminated wall — a circle bisected by a vertical line. Alchemist's mark or warning.`,
  ` The chemical smell intensifies near a section of wall where the bricks have partially dissolved, revealing a pocket of crystallized residue behind them.`,
];

const midDetails = [
  ` A crystal formation has grown around the remains of an iron bracket, absorbing the metal into its structure. The iron is visible inside the translucent growth.`,
  ` The vapor is thicker here — a visible cloud that swirls in slow patterns, disturbed by movement and slow to settle.`,
  ` A section of wall has crumbled entirely, revealing a pocket of pure crystalline growth behind it. The light from within is intense and steady.`,
  ` Something has been feeding on the crystal here — tooth marks score the surface of a formation, and shards of crystal litter the floor below it.`,
  ` A boot lies half-embedded in the crystallized floor, its leather stiff and iridescent. Whoever wore it left in a hurry — or didn't leave at all.`,
  ` The crystal formations here emit a faint chiming sound when disturbed, a musical note that hangs in the air long after the vibration stops.`,
  ` A pool of liquid reagent has collected in a depression, its surface perfectly still and mirror-bright. The reflection shows the ceiling — or something else.`,
  ` Claw marks score the crystal walls — something large has passed through here, scraping the formations hard enough to leave deep gouges.`,
];

const innerDetails = [
  ` A massive crystal spire has split in two, revealing a hollow core filled with slowly churning luminous liquid. The light from within is mesmerizing.`,
  ` The humming vibration shifts pitch as you move through this section, as if the crystals are resonating with your presence.`,
  ` A formation near the floor has grown around something organic — bones, perhaps, or the remains of a creature consumed by the crystallization.`,
  ` The crystal here is warm to the touch, almost body temperature. The internal light pulses faster near the point of contact.`,
  ` Shattered crystal fragments cover the floor where a formation has collapsed. The edges are sharp enough to cut through leather.`,
  ` The air is so thick with luminous particles that each breath leaves a faint glow on exhaled vapor. The contamination is being inhaled with every breath.`,
  ` A thin, high-pitched whine emanates from a cluster of needle-thin crystal formations, just at the edge of hearing. It sets the teeth on edge.`,
  ` The crystal growth has formed what looks almost like a doorway — an arch of fused formations framing empty space. Coincidence, or something stranger.`,
];

const detailPools: Record<MenagerieSection, string[]> = {
  outer: outerDetails,
  mid: midDetails,
  inner: innerDetails,
};

/** Deterministically add a distinctive detail (~40% chance based on tag hash). */
export function maybeAddMenagerieDetail(desc: string, tag: string, section: MenagerieSection): string {
  const h = hashTag(tag + '_menagerie_detail');
  if (h % 5 >= 2) return desc;
  const pool = detailPools[section];
  const detail = pick(pool, tag, 13);
  return desc + detail;
}
