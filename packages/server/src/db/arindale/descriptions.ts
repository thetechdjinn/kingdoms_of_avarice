/**
 * Composable description templates for Arindale street rooms.
 * Uses deterministic hash from room tag to ensure same output on re-run.
 */

// Deterministic hash: same tag always picks same description
export function hashTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pick<T>(arr: T[], tag: string, salt = 0): T {
  return arr[(hashTag(tag) + salt) % arr.length];
}

// Street names
export const EW_STREETS = ['Harbor Road', 'Marshal Street', 'Main Street', 'Cloister Court', 'Southwall Road'];
export const NS_STREETS = ['Westwall Street', 'Market Street', "King's Road", 'Cathedral Lane', 'Eastwall Street'];

// Row/col indices (0-based)
export function ewStreetName(row: number): string { return EW_STREETS[row]; }
export function nsStreetName(col: number): string { return NS_STREETS[col]; }

// Intersection name: "Corner of X and Y"
export function intersectionName(row: number, col: number): string {
  // Town Square special case
  if (row === 2 && col === 2) return 'Town Square';
  return `Corner of ${ewStreetName(row)} and ${nsStreetName(col)}`;
}

// ── Per-street flavor pools ────────────────────────────────────────────

const harborRoadDescriptions = [
  `Salt wind carries the cries of gulls and the creak of rigging from the docks to the north. Weathered timber buildings lean close along the road, their paint peeling in the sea air.`,
  `The road here smells of brine and tar. Coils of rope and stacked crates sit outside a ship chandler's door. Gulls wheel above the rooftops.`,
  `Fishing nets hang drying over a low wall alongside the road. The sound of waves slapping against wooden hulls echoes from the harbor beyond.`,
  `A salt-crusted sign creaks overhead in the harbor breeze. The cobblestones are slick with sea spray, and the air tastes of the open water.`,
  `Weathered planks patch the road where the cobblestones have crumbled. The smell of smoked fish drifts from a nearby smokehouse, mingling with the ever-present salt air.`,
  `Canvas tarps flutter over a row of market stalls selling the morning catch. The gutters run with fish-scale water, and dock workers shoulder past with heavy loads.`,
  `The road widens near a loading yard where barrels are stacked three high. A sailor sits on an upturned crate, mending a torn sail with thick fingers.`,
];

const marshalStreetDescriptions = [
  `Sturdy brick buildings with iron-banded doors line this wide street in the garrison quarter. The clatter of a training yard echoes from somewhere nearby.`,
  `An iron bulletin board mounted on the barracks wall displays duty rosters and wanted notices. The cobblestones here are laid in precise rows.`,
  `A pair of city guards march past in step, their mail shirts clinking softly. The buildings along this stretch are solid and well-maintained.`,
  `The street runs straight and wide between barracks walls and administrative buildings. Boot prints mark the dust where patrols have worn a path.`,
  `A flagpole bearing the city's standard stands at the edge of the street. The garrison quarter's orderly architecture contrasts with the busier districts to the south.`,
  `Weapon racks stand outside a guardhouse door, empty but for a forgotten practice sword. The street smells of leather polish and lamp oil.`,
  `A horse trough sits against the garrison wall, its water still and green. The clang of a blacksmith's hammer rings out from behind a high fence.`,
];

const mainStreetDescriptions = [
  `The city's main thoroughfare stretches east and west, wide enough for two carts to pass abreast. Buildings of pale stone line both sides, their upper stories leaning slightly toward each other.`,
  `Foot traffic flows steadily along Main Street. A street vendor's cart selling roasted chestnuts sends a curl of fragrant smoke across the cobblestones.`,
  `Sunlight falls between the buildings onto worn cobblestones polished by generations of footsteps. A carved stone milestone marks the distance to the city gates.`,
  `The broad street hums with the business of the day. A lamplighter's ladder leans against a post, left behind from the morning rounds.`,
  `Window boxes overflow with trailing greenery along the upper floors. The street curves gently, opening a view of rooftops and the cathedral spires beyond.`,
  `A busker plays a lute on the corner, his cap at his feet. The crowd parts around him without slowing, each person intent on their own errand.`,
  `Worn grooves in the cobblestones trace the paths of countless cart wheels. The buildings here are older, their stone facades darkened by years of coal smoke.`,
];

const cloisterCourtDescriptions = [
  `Tall stone buildings cast long shadows across this quiet street. The air carries a faint trace of incense drifting from the cathedral whose spires rise above the rooftops.`,
  `Moss creeps along the base of the walls where sunlight seldom reaches. The street is quieter here than in the bustling market district to the west.`,
  `Carved stone lintels mark the doorways along this sedate street. A cat watches from a high window ledge, its tail curling lazily.`,
  `The cobblestones give way to smooth flagstones worn concave by centuries of foot traffic. A wrought-iron gate stands open beside a small walled garden.`,
  `Ivy climbs the stone facades of the buildings lining this quiet court. The distant sound of chanting drifts from the direction of the cathedral.`,
  `A stone bench sits in a nook between two buildings, shaded by an old plane tree. Fallen leaves gather in the gutters, undisturbed.`,
  `The lane narrows slightly where a buttress arcs overhead between two buildings. Pigeons roost on the ledge above, cooing softly in the shade.`,
];

const southwallRoadDescriptions = [
  `The road runs along the inside of the city's southern wall. The massive stone fortification rises to the south, its crenellated top patrolled by distant guards.`,
  `The city wall looms close on the south side of the road, its stones fitted without mortar. Weeds push up through cracks in the cobbles near its base.`,
  `A guardhouse is built into the wall's base, its narrow windows watching the road. The street here is quieter, far from the bustle of the town center.`,
  `Sunlight slants over the top of the southern wall, casting a hard line of shadow across the road. Sparrows nest in the gaps between the massive stones.`,
  `The road follows the gentle curve of the city wall. A drainage channel runs along its base, carrying rainwater toward the eastern gate.`,
  `Scraggly bushes grow in the strip of dirt between the road and the wall's foundation. A guard descends a narrow stone stairway set into the wall.`,
  `The stones of the city wall are weathered smooth on this stretch, darkened by rain and age. A faded mural of the city's founding is barely visible on a facing building.`,
];

const westwallStreetDescriptions = [
  `The western city wall rises to the left, its battlements silhouetted against the sky. The street runs along its base, quieter than the avenues closer to the center.`,
  `A narrow stair climbs the inside of the wall, leading up to the wall walk above. The buildings on the east side of the street are modest and functional.`,
  `The wall's shadow falls across the street for most of the day, keeping the cobblestones cool and slightly damp. Lichen grows in green patches on the lower stones.`,
  `A tower built into the wall rises above the rooftops, its arrow slits dark. The street bends slightly to follow the wall's course.`,
  `Stacked lumber and building materials sit along the base of the wall where repairs are underway. A mason's scaffold clings to the stonework above.`,
  `The western wall blocks the afternoon sun, leaving this stretch of street in perpetual shade. A stray dog noses at scraps near a shuttered doorway.`,
  `Wind whistles through the crenels high above, carrying the faint sounds of the countryside beyond the wall. The street here feels far from the city's center.`,
];

const marketStreetDescriptions = [
  `Colorful awnings shade the storefronts lining both sides of this busy street. The scent of fresh bread mingles with the tang of oiled leather from a nearby shop.`,
  `A fruit cart heaped with bright apples and pears sits at the edge of the street. Shoppers weave around it without breaking stride.`,
  `Shop signs of carved wood and painted tin hang over the doorways, creaking in the breeze. The street is alive with the calls of merchants hawking their wares.`,
  `Bolts of dyed fabric are draped over a railing outside a tailor's shop, adding splashes of crimson and indigo to the streetscape.`,
  `The cobblestones here are stained with spilled dye and ground-in produce. A boy sweeps the walk in front of a chandler's shop with a straw broom.`,
  `A heavyset woman arranges wheels of cheese in a shop window while two merchants argue prices across the street. Commerce never pauses here.`,
  `The smell of fresh-baked pastry drifts from an open bakery door. A queue of customers spills onto the street, chatting as they wait their turn.`,
];

const kingsRoadDescriptions = [
  `The broad avenue of King's Road runs north and south through the heart of the city. The pavement is well-maintained, the stones pale and evenly set.`,
  `Royal banners hang from iron brackets along the road, their gold thread catching the sunlight. The buildings here are grander than those on the side streets.`,
  `A mounted patrol rides past at a walk, the guards' eyes scanning the crowd. King's Road is the city's spine, connecting the harbor to the castle beyond.`,
  `The avenue is wide and straight, offering a clear view to the north where the road rises toward the castle. A stone planter divides the lanes.`,
  `Tall windows of leaded glass look down from the buildings lining the road. The architecture grows more ornate toward the north end of the avenue.`,
  `A public fountain stands at the roadside, its basin catching water from a carved lion's mouth. Passersby pause to fill waterskins and splash their faces.`,
  `The road's center is grooved by cart wheels, but the walkways on either side are smooth and well-swept. A flower seller arranges bouquets on a folding table.`,
];

const cathedralLaneDescriptions = [
  `The lane passes between tall stone buildings whose upper stories nearly touch overhead. The air carries a faint trace of incense and candle wax.`,
  `Stained glass throws colored light across the paving stones from a high window. The lane is hushed, the bustle of the market seeming far away.`,
  `A wrought-iron lamp bracket extends from the wall, its glass panes darkened with soot. The cathedral's shadow falls across the lane in the afternoon.`,
  `Stone steps lead down to a basement door where a herbalist's sign hangs. The buildings along Cathedral Lane are older than most in the city.`,
  `The lane is narrow and cobbled, flanked by walls of dark stone. A faint bell tolls from the cathedral, marking the passing hour.`,
  `A small shrine is set into the wall, its niche holding a carved saint and a stub of candle. Someone has left a sprig of dried flowers at its base.`,
  `Quiet footsteps echo between the close-set buildings. A priest hurries past with a bundle of books under his arm, nodding a greeting.`,
];

const eastwallStreetDescriptions = [
  `Modest stone houses with flower boxes in the windows line this quiet street along the eastern wall. A cat dozes on a sunlit doorstep.`,
  `Laundry dries on lines strung between second-floor balconies overhead. The distant sounds of the market are a muffled murmur here.`,
  `The eastern wall rises above the rooftops to the right, its stones warmed by the morning sun. Children play a chasing game down the street.`,
  `A well sits at the edge of the street, its rope and bucket worn smooth with use. Housewives gather to draw water and exchange the day's gossip.`,
  `Painted shutters and small front gardens give the street a tidy, domestic feel. The smell of someone's dinner drifts from an open window.`,
  `The street curves gently along the base of the eastern wall. Climbing roses cling to a trellis beside a cottage door.`,
  `A quiet lane branches off between two houses, barely wide enough for one person. The main street continues along the wall in peaceful routine.`,
];

// Map row/col to description pools
const ewDescriptionPools: Record<number, string[]> = {
  0: harborRoadDescriptions,
  1: marshalStreetDescriptions,
  2: mainStreetDescriptions,
  3: cloisterCourtDescriptions,
  4: southwallRoadDescriptions,
};

const nsDescriptionPools: Record<number, string[]> = {
  0: westwallStreetDescriptions,
  1: marketStreetDescriptions,
  2: kingsRoadDescriptions,
  3: cathedralLaneDescriptions,
  4: eastwallStreetDescriptions,
};

// ── Intersection descriptions ──────────────────────────────────────────

export function intersectionDescription(row: number, col: number, tag: string): string {
  // Town Square — manhole to Central Hub
  if (row === 2 && col === 2) {
    return `You stand in the center of Arindale's town square, where Main Street crosses King's Road. A weathered stone fountain bubbles quietly at the heart of the open plaza. Townsfolk cross in every direction, and the sounds of the city echo off the surrounding buildings. A heavy iron manhole cover is set into the cobblestones near the fountain's base.`;
  }

  // Harbor Rd & King's Rd — manhole to North Tunnels
  if (row === 0 && col === 2) {
    return `Harbor Road meets King's Road at this windswept intersection. The smell of salt and tar blows in from the docks to the north. Cart ruts groove the cobblestones where goods are hauled between the harbor and the city center. A heavy iron manhole cover sits at the edge of the road, its rim crusted with salt.`;
  }

  // Main St & Market St — manhole to West Tunnels
  if (row === 2 && col === 1) {
    return `Main Street meets Market Street at a busy intersection thronged with shoppers and merchants. Colorful awnings shade the storefronts on every corner. The cobblestones are stained with spilled dye and ground produce from decades of market traffic. A heavy iron manhole cover is set into the stones near the gutter.`;
  }

  // Marshal St & Eastwall St — manhole to East Tunnels
  if (row === 1 && col === 4) {
    return `Marshal Street meets Eastwall Street at a quiet intersection on the garrison quarter's eastern edge. The orderly architecture of the barracks district gives way to the more modest buildings along the wall. A heavy iron manhole cover sits in the cobblestones, partly obscured by a thin layer of dust.`;
  }

  // Southwall Rd & King's Rd — manhole to South Tunnels
  if (row === 4 && col === 2) {
    return `Southwall Road meets King's Road beneath the shadow of the southern city wall. The massive fortification looms overhead, its crenellated top patrolled by distant guards. The intersection is quieter than those closer to the city center. A heavy iron manhole cover is half-hidden by weeds growing between the cobblestones.`;
  }

  const ew = ewStreetName(row);
  const ns = nsStreetName(col);

  const templates = [
    `${ew} meets ${ns} at this busy intersection. The cobblestones are worn smooth where foot traffic converges from all four directions.`,
    `The crossing of ${ew} and ${ns} opens into a small square where a weathered signpost points in four directions.`,
    `Two of the city's streets converge here — ${ew} running east and west, ${ns} stretching north and south. The buildings at the corners are rounded, worn by the passage of carts.`,
    `A wide intersection where ${ew} crosses ${ns}. An iron lamppost stands at the corner, its base wrapped in handbills and notices.`,
    `The streets of ${ew} and ${ns} intersect beneath a span of open sky. Cobblestones radiate outward from a worn drain cover at the center.`,
  ];

  return pick(templates, tag);
}

// ── Mid-street descriptions ────────────────────────────────────────────

export function ewStreetDescription(row: number, tag: string): string {
  const pool = ewDescriptionPools[row];
  return pick(pool, tag);
}

export function nsStreetDescription(col: number, tag: string): string {
  const pool = nsDescriptionPools[col];
  return pick(pool, tag);
}

// ── Distinctive details (1 in 5 chance, hash-based) ────────────────────

const distinctiveDetails = [
  ` A stray cat watches from beneath a handcart, its eyes gleaming.`,
  ` A crooked lamppost leans over the street, its iron frame bent by some long-forgotten collision.`,
  ` A puddle in a dip in the cobblestones reflects the sky like a tiny mirror.`,
  ` Someone has chalked a crude map on the wall, already half-washed away by rain.`,
  ` A cracked pot of geraniums sits on a window ledge, stubbornly blooming despite neglect.`,
  ` A faded wanted poster peels from a notice board, the face on it long since worn away.`,
  ` The corner of a building bears deep scratch marks at knee height, as if scored by a cart axle.`,
  ` A bootblack has set up a small stool near the wall, though no customers are in sight.`,
  ` A drain grate emits a thin thread of steam, carrying a faint sulfurous smell from below.`,
  ` A pigeon pecks at crumbs between the cobblestones, indifferent to the passing feet.`,
];

export function maybeAddDetail(desc: string, tag: string): string {
  const h = hashTag(tag + '_detail');
  if (h % 5 !== 0) return desc;
  const detail = pick(distinctiveDetails, tag, 7);
  return desc + detail;
}
