/**
 * Description pools for the Sanctum of the Damned rooms.
 * Uses deterministic hash selection from arindale descriptions.
 */
import { hashTag, pick } from '../arindale/descriptions.js';

// ── Standard room (*) descriptions — converted sewer, outer approach ────

const standardDescriptions = [
  `A section of sewer tunnel that has been swept clean — the usual filth scraped away to reveal damp stonework beneath. The air is stale but lacks the sewer's characteristic reek. Someone has been maintaining this passage. Faint scuff marks on the floor suggest regular foot traffic.`,
  `The tunnel here has been cleared of debris and refuse. The walls are damp but scrubbed, the mortar lines visible between the bricks. A few iron brackets have been hammered into the stone, though whatever they held has been removed. The silence feels deliberate.`,
  `A converted passage where the sewer's original purpose has been erased by careful, methodical cleaning. The floor is even, the ceiling braced with rough timber where the original stonework has crumbled. The air smells faintly of lye and something else — incense, perhaps.`,
  `The tunnel walls are bare stone, cleaned to an unusual degree for a sewer passage. Water stains mark the high-water line, but below it the bricks have been scrubbed almost white. The floor is dry and swept. Someone is living down here.`,
  `A stretch of tunnel that feels wrong — too clean, too quiet. The sewer grime has been scraped away, replaced by a thin film of something waxy that darkens the stone. The ceiling is low enough to touch. Scratch marks on the walls could be symbols or could be nothing.`,
  `The passage has been widened where the original brickwork allowed, creating a space almost comfortable enough to stand upright. The floor has been leveled with packed earth over the old drain channel. The air is close and still, carrying a faint chemical smell.`,
  `An intersection of old drainage channels that someone has converted into a usable corridor. The grates have been removed or covered, the worst of the sewage diverted elsewhere. What remains is damp, cold stone and an oppressive quiet broken only by distant dripping.`,
  `The tunnel widens into a cleared area where the ceiling vaults slightly higher. The walls show marks of tool work — someone has chiseled away protrusions and smoothed the worst of the rough stone. A few niches have been carved into the walls, empty now but recently used.`,
];

// ── Cult Hallway (H) descriptions — black cloth, dark candles, symbols ──

const hallwayDescriptions = [
  `Black cloth has been draped across the tunnel walls, hiding the stonework behind heavy fabric that absorbs light and sound. Iron sconces are bolted to the wall at regular intervals, each holding a thick dark candle that burns with a low, steady flame. Angular symbols have been painted on the cloth in a substance that catches the candlelight.`,
  `A corridor transformed by deliberate ritual decoration. The walls are covered in dark fabric, the floor swept clean and marked with painted lines that form geometric patterns. Dark candles in iron holders cast flickering shadows. The air is heavy with the smell of burnt incense and tallow.`,
  `The hallway is draped in black, the cloth pinned to the ceiling and walls with iron nails. Between the drapes, angular symbols have been carved directly into the stone — deep, deliberate cuts filled with something dark. The candlelight makes the shadows move like living things.`,
  `A narrow corridor where every surface has been claimed by the cult. Black cloth covers the walls, dark candles line the passage, and the floor is marked with symbols in chalk and ash. The air tastes of smoke and incense. The silence is absolute, as if the cloth absorbs all sound.`,
  `The passage is lined with heavy black drapes that billow slightly in drafts too subtle to feel. Iron sconces hold dark candles whose flames burn steady and unwavering. The symbols painted on the cloth are uniform and precise — whoever made them was practiced and deliberate.`,
  `Dark fabric covers the walls from ceiling to floor, creating a corridor that feels narrower than it is. The candles here burn low, their flames blue-tinged and almost smokeless. The air is thick with incense. Shadows pool in the corners where the candlelight fails to reach.`,
  `A cult hallway where the original tunnel architecture is completely hidden behind layers of black cloth. The drapes are thick enough to muffle footsteps and swallow sound. Small symbols have been stitched into the fabric in dark thread — visible only when the candlelight catches them at the right angle.`,
  `The corridor is a study in controlled darkness. Black cloth, dark candles, angular symbols repeated in careful patterns along the walls. The floor has been covered with thin rush matting that dampens footsteps. The incense smell is strongest here, emanating from small ceramic burners placed in wall niches.`,
];

// ── Name pools for standard (*) rooms ───────────────────────────────────

const standardNames = [
  'Swept Passage',
  'Cleared Tunnel',
  'Converted Corridor',
  'Maintained Passage',
];

// ── Section lookup and helpers ──────────────────────────────────────────

export type SanctumSection = 'standard' | 'hallway';

const sectionPools: Record<SanctumSection, string[]> = {
  standard: standardDescriptions,
  hallway: hallwayDescriptions,
};

/** Pick a deterministic description for a sanctum room based on section and tag. */
export function sanctumDescription(section: SanctumSection, tag: string): string {
  const pool = sectionPools[section];
  return pick(pool, tag);
}

/** Pick a deterministic room name for a standard (*) room. */
export function sanctumRoomName(tag: string): string {
  return pick(standardNames, tag);
}

// ── Distinctive details ─────────────────────────────────────────────────

const outerDetails = [
  ` A clay water jug sits in a wall niche, half-full and recently used. Someone has been here within the day.`,
  ` Faint chalk marks on the floor form an arrow pointing deeper into the passage — a guide mark for cult members navigating the tunnels.`,
  ` A discarded scrap of dark cloth lies in the corner, torn from a larger piece. Black dye stains the stone beneath it.`,
  ` The walls here show the ghosts of old graffiti — scratched symbols that have been methodically chiseled away by whoever claimed this passage.`,
  ` A small iron hook has been driven into the mortar between bricks, holding nothing. A dark stain on the wall below it suggests a lantern once hung here.`,
  ` Boot prints in the thin layer of dust on the floor. Multiple sets, all heading the same direction. Recent.`,
  ` A rat lies dead in the corner, its neck cleanly broken. Not a trap kill — something did this deliberately, efficiently.`,
  ` The air currents shift here, pulling toward the walls. Somewhere behind the stone, air is moving through hidden spaces.`,
];

const innerDetails = [
  ` A dark candle has burned down to a puddle of black wax on the floor, its wick still faintly smoking. Someone was here recently.`,
  ` The symbols painted on the cloth are different here — larger, more complex, layered over each other in patterns that seem to shift when viewed indirectly.`,
  ` A thin line of dark powder has been laid across the threshold — ash, or something ground finer than ash. Stepping over it feels like crossing a boundary.`,
  ` The incense here is different — heavier, with an undertone of something metallic. It clings to the cloth and settles in the lungs.`,
  ` Wax has pooled at the base of the sconces and hardened into dark stalactites that hang from the iron brackets. Years of candles, burning continuously.`,
  ` A small altar niche has been carved into the wall between the drapes — empty, but the stone inside is stained dark and smooth with use.`,
  ` The cloth on one wall is pulled slightly aside, revealing deep scratch marks in the stone beneath. Something was carved here, then deliberately hidden.`,
  ` A ceramic incense burner sits on the floor, cracked but still smoking faintly. The incense inside is unlike any temple blend — dark, resinous, wrong.`,
];

export type DetailZone = 'outer' | 'inner';

const detailPools: Record<DetailZone, string[]> = {
  outer: outerDetails,
  inner: innerDetails,
};

/** Deterministically add a distinctive detail (~40% chance based on tag hash). */
export function maybeAddSanctumDetail(desc: string, tag: string, zone: DetailZone): string {
  const h = hashTag(tag + '_sanctum_detail');
  if (h % 5 >= 2) return desc;
  const pool = detailPools[zone];
  const detail = pick(pool, tag, 13);
  return desc + detail;
}
