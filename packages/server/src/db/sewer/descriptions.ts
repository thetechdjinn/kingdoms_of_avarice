/**
 * Description pools for Arindale Sewer rooms.
 * Uses deterministic hash selection from arindale descriptions.
 */
import { hashTag, pick } from '../arindale/descriptions.js';

// ── Central Hub descriptions ────────────────────────────────────────

const centralDescriptions = [
  `The tunnel widens into a vaulted junction where several passages converge. Pale light filters down through a grated opening far above, casting faint squares of grey on the damp stone floor. The air is marginally less foul here than in the deeper tunnels.`,
  `A broad chamber opens at the meeting of four tunnels. Water trickles in lazy channels along the floor, converging at a central drain. The stonework is solid and well-fitted — this was built to last.`,
  `The ceiling rises higher here, the brickwork arching into a proper vault. A rusted iron ladder bolted to the wall leads up to a sealed grate. The echoes of dripping water come from every direction.`,
  `A wide passage with a shallow channel of water running down its center. The stones are worn smooth by decades of flow. Faint sounds drift down from the city above — muffled footsteps, a distant cart.`,
  `The tunnel opens into a circular chamber with a domed ceiling. A ring of iron brackets once held torches, though most are empty now. The air moves slightly, stirred by unseen ventilation.`,
  `A junction of old stone tunnels, their walls streaked with mineral deposits. The brickwork here is cleaner than in the deeper passages, and the smell is merely damp rather than putrid.`,
  `The passage widens where a side channel joins the main flow. Moss grows in patches where faint light reaches through overhead grates, the only green in this underground world.`,
  `Squared-off stonework lines this section of tunnel. A maintenance alcove is set into one wall, its shelves empty but for a forgotten lantern, rusted beyond use.`,
];

// ── North Tunnel descriptions ───────────────────────────────────────

const northDescriptions = [
  `The tunnel walls glisten with moisture that seeps through from the harbor above. The air is heavy with the smell of brine and sewage, and the sound of water is constant — dripping, trickling, rushing through unseen channels.`,
  `Damp stone walls press close in this waterfront drainage tunnel. Green slime coats the lower bricks where the water level rises during high tide. The passage curves slightly, following some forgotten underground stream.`,
  `A wide drainage channel runs along the floor, carrying dark water toward the harbor outflow. The stones are stained with tide marks at varying heights. Something skitters in the darkness ahead.`,
  `The tunnel ceiling drips steadily, each drop echoing in the enclosed space. Salt deposits crust the upper walls where seawater has worked its way through the stone over the years.`,
  `A brick-lined passage stretches into the gloom. The mortar between the stones is soft and crumbling where persistent moisture has done its work. The smell of the sea mingles with the sewer stench.`,
  `Water pools in shallow depressions where the tunnel floor has settled unevenly. The bricks here are darker than elsewhere — stained by tidal seepage from the harbor district above.`,
  `The tunnel runs straight between heavy stone walls. Tide debris — bits of rope, fish bones, broken shells — has collected in the corners where the current pushes it. The harbor is somewhere overhead.`,
  `A low-ceilinged passage drips with condensation. The stones are cold to the touch, and the air carries a salt tang that cuts through the sewer's usual stench.`,
  `The walls of this tunnel are streaked with dark waterlines from seasonal flooding. A rusted iron ring is set into the wall — perhaps once used to moor something in the darkness.`,
  `Barrel-vaulted brickwork forms the ceiling of this long drainage tunnel. The acoustics are strange — distant sounds arrive as hollow echoes, making it hard to judge their origin or distance.`,
];

// ── West Tunnel descriptions ────────────────────────────────────────

const westDescriptions = [
  `The brickwork in this section is older, the mortar crumbling between mismatched stones. Strange chemical stains streak the walls in iridescent patterns — residue from the alchemist's shops above, slowly seeping down through the earth.`,
  `An older tunnel, its construction predating the rest of the sewer. The bricks are a different color — darker, hand-shaped rather than molded. A faint acrid smell hangs in the still air.`,
  `The walls are streaked with odd discolorations — patches of vivid green, deep purple, and a sickly yellow that seems to glow faintly in the dark. Something from above has been draining into these tunnels for years.`,
  `Crumbling brick walls bear the marks of age and chemical exposure. The mortar has dissolved in places, leaving gaps wide enough to reach a hand through. The air tastes faintly metallic.`,
  `A tunnel of ancient brick, its floor covered in a thin film of oily residue. The sheen catches what little light there is, creating brief rainbows in the murk. The runoff from the market district collects here.`,
  `The passage is lined with bricks so old they've begun to round at the edges. Thick roots push through gaps in the ceiling, groping downward into the damp air. A faint chemical tang irritates the nose.`,
  `Old construction gives this tunnel a different character — rougher, more uneven, as if built by different hands in a different era. Mineral deposits have crystallized on the lower walls in brittle formations.`,
  `The stones here are deeply stained with alchemical runoff. In places the residue has eaten into the brickwork itself, leaving pockmarked surfaces that collect dark, oily water.`,
];

// ── East Tunnel descriptions ────────────────────────────────────────

const eastDescriptions = [
  `Massive stone blocks form the walls of this tunnel — the foundations of the cathedral district above. The construction is heavier and more imposing than the common sewer brickwork, built to bear the weight of sacred architecture.`,
  `The tunnel passes between walls of dressed stone, each block larger than a man could lift alone. These are the deep foundations of the buildings above — the garrison and cathedral whose weight presses down into the earth.`,
  `Heavy stone walls line this passage, their surfaces smooth and precisely fitted. The air is cool and dry compared to the damper sections of the sewer. Faint scratchings echo from somewhere in the darkness.`,
  `The tunnel cuts through what appears to be an older foundation wall. The stones are enormous, fitted without mortar in a style not used in Arindale's current construction. Whatever stood here before was built to endure.`,
  `A passage of squared stone blocks, their surfaces carved with mason's marks that no one alive can read. The ceiling is higher here, supported by the weight-bearing architecture of the cathedral above.`,
  `The walls transition from common brick to heavy stone masonry as the tunnel passes beneath the cathedral district. The air carries a faint trace of incense — or perhaps it's imagination, knowing what lies above.`,
  `Old stone foundations create natural chambers in the sewer here, where walls of different eras meet at odd angles. A cold draft pushes through gaps in the ancient masonry.`,
  `The tunnel is braced by cathedral foundations — massive stone pillars that descend through the ceiling into the sewer floor. The spaces between them create a series of narrow passages.`,
];

// ── South Tunnel descriptions ───────────────────────────────────────

const southDescriptions = [
  `The tunnel descends deeper here, the air growing colder and the darkness more absolute. No light from above reaches this far down. The only sounds are dripping water and the faint scratch of unseen claws.`,
  `A deep passage with no hint of the city above. The stonework is rough and utilitarian — built for function, not for anyone to see. The darkness ahead feels thick, resistant, as if the tunnel resents intrusion.`,
  `The tunnel walls are damp with condensation in the deep cold. No grates or shafts connect to the surface here. This is the underbelly of the city in the truest sense — forgotten and forsaken.`,
  `A section of tunnel where the stonework shows signs of deliberate maintenance — fresh mortar patches, a replaced brick here and there. Someone has been down here more recently than the city above would like to admit.`,
  `The passage narrows between walls of rough stone. The floor is thick with accumulated grime, but in places the muck has been disturbed — footprints, scuff marks, drag lines. Someone comes this way.`,
  `Deep in the sewer, the air barely moves. The silence is broken only by the distant sound of water and an occasional scraping that could be anything — or nothing. The darkness swallows torchlight within a few paces.`,
  `The tunnel descends at a shallow angle, the water flowing faster along the central channel. The brickwork is older and less precise this deep, as if the original builders were working at the limits of their ambition.`,
  `A low-ceilinged passage that forces a slight stoop. The walls are close and the air is stale. Scratches on the stone at shoulder height suggest regular traffic — but not the kind that walks upright.`,
];

// ── Cross-connection descriptions ───────────────────────────────────

const crossDescriptions = [
  `A narrow connecting tunnel links two larger passages. The walls are plain brick, functional and unremarkable. Water trickles along a shallow groove in the floor.`,
  `A side passage branches between the main tunnels, its ceiling lower and its walls closer together. Cobwebs span the upper corners, suggesting less traffic than the main routes.`,
  `A lateral tunnel connects the larger passages. The brickwork is newer here — perhaps a later addition to improve drainage between the original tunnel networks.`,
  `The tunnel jogs sideways through a connecting passage. The construction changes slightly — different brick, different mortar — marking where two phases of sewer construction were joined.`,
  `A narrow passage cuts between the main tunnels at an angle. The floor is uneven where the builders worked around existing foundations. Water pools in the low spots.`,
  `A connecting tunnel with a slight curve, linking the larger passages on either side. The air moves through it in a slow draft, carrying smells from both directions.`,
];

// ── Flooded Section descriptions ────────────────────────────────────

const floodedDescriptions = [
  `Dark water fills this section of tunnel to waist height, cold and sluggish. The normal flow has backed up here, turning the passage into a stagnant pool. Things move beneath the surface — ripples that have no visible source.`,
  `The tunnel is flooded, murky water lapping against the brickwork well above the normal waterline. Debris bobs on the surface — rotting wood, scraps of cloth, things best not examined closely. The water is bitterly cold.`,
  `Stagnant water fills the passage almost to the ceiling in places, leaving only a narrow band of foul air above. The water is dark and opaque, hiding whatever lies beneath. The current that should carry it away has stopped.`,
  `The flooding is worse here — water rising to chest height, its surface covered in a scum of organic matter. The blocked drainage has turned this section into an underground swamp. Something bumps against your legs beneath the water.`,
];

// ── Blockage Section descriptions ───────────────────────────────────

const blockageDescriptions = [
  `Collapsed stonework partially blocks the tunnel ahead. Broken bricks and rubble have been wedged together with accumulated debris, creating a dam that has redirected the water flow. The obstruction looks partly deliberate.`,
  `The tunnel is choked with rubble and refuse. Broken masonry, rotting timbers, and mounds of unidentifiable debris form a barrier that blocks the normal drainage flow. The air behind it is foul and stagnant.`,
  `A massive blockage fills most of the tunnel — collapsed ceiling stones mixed with what appears to be deliberately placed debris. Water backs up behind it, seeping through gaps in the obstruction.`,
  `The passage is nearly impassable, choked with rubble and accumulated waste. The blockage extends floor to ceiling, with only narrow gaps where dark water forces its way through. Something has been nesting in the debris.`,
];

// ── Thieves Guild Approach descriptions ─────────────────────────────

const tgApproachDescriptions = [
  `The tunnel is noticeably cleaner here — the walls have been swept, the worst of the grime scraped away. Iron torch sconces are set into the walls at regular intervals, though none are lit. Fresh bootprints mark the damp floor.`,
  `This section of sewer has been maintained by hands other than the city's. The brickwork has been repointed, loose stones replaced. The passage feels less like a sewer and more like a corridor someone uses regularly.`,
  `The tunnel takes a deliberate turn, then another, creating a series of switchbacks that would confuse anyone trying to navigate by direction alone. The floor has been swept clean, and faint scratches on the walls mark the turns.`,
  `A cleaner stretch of tunnel with torch brackets on the walls and a floor swept free of debris. Dead-end branches open to either side — lookout posts, perhaps, or deliberately misleading paths.`,
  `The sewer changes character here. The filth gives way to swept stone, the random tunnels to purposeful corridors. Someone has made this section their own, and they don't want uninvited guests finding their way through.`,
  `The passage is straighter and better maintained than the surrounding tunnels. A faint smell of torch smoke hangs in the air. The walls bear small scratches at eye height — directional marks for those who know how to read them.`,
];

// ── Section lookup and helper ───────────────────────────────────────

export type SewerSection = 'central' | 'north' | 'west' | 'east' | 'south' | 'cross' | 'flooded' | 'blockage' | 'tg_approach';

const sectionPools: Record<SewerSection, string[]> = {
  central: centralDescriptions,
  north: northDescriptions,
  west: westDescriptions,
  east: eastDescriptions,
  south: southDescriptions,
  cross: crossDescriptions,
  flooded: floodedDescriptions,
  blockage: blockageDescriptions,
  tg_approach: tgApproachDescriptions,
};

/** Pick a deterministic description for a sewer room based on section and tag. */
export function sewerDescription(section: SewerSection, tag: string): string {
  const pool = sectionPools[section];
  return pick(pool, tag);
}

// ── Distinctive details for sewer rooms ─────────────────────────────

const sewerDetails = [
  ` Rat droppings litter the ledge along one wall.`,
  ` A rusted iron grate covers a side drain, its bars bent outward by some past force.`,
  ` Scratching sounds echo from a crack in the wall, then stop abruptly.`,
  ` A thick cobweb spans the upper corner, its occupant nowhere to be seen.`,
  ` The remains of a campfire — cold ashes and a charred stick — sit in a dry alcove.`,
  ` A crude arrow has been scratched into the wall, pointing deeper into the tunnels.`,
  ` Something pale and shapeless clings to the ceiling, pulsing faintly. Best not to look too closely.`,
  ` A broken clay pipe juts from the wall, dribbling dark water in a steady stream.`,
  ` The faint sound of something large moving through water echoes from the darkness.`,
  ` A worn leather boot lies abandoned in the muck, its sole chewed through.`,
];

/** Deterministically add a distinctive detail (1 in 4 chance based on tag hash). */
export function maybeAddSewerDetail(desc: string, tag: string): string {
  const h = hashTag(tag + '_sewer_detail');
  if (h % 4 !== 0) return desc;
  const detail = pick(sewerDetails, tag, 13);
  return desc + detail;
}
