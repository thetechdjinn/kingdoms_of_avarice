/**
 * Generates sewer section TypeScript files from parsed-map.json.
 * Run: npx tsx packages/server/src/db/sewer/generate-sections.ts
 *
 * Reads the parser output and produces complete section files
 * that match the ASCII map exactly. Uses labels and positions
 * to assign tags dynamically — no hardcoded room IDs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEWER_DIR = __dirname;

interface PRoom {
  id: string;
  row: number;
  charStart: number;
  charEnd: number;
  label: string;
  section: string;
}
interface PConn {
  fromId: string;
  toId: string;
  dir: 'east' | 'south';
}

const data = JSON.parse(
  fs.readFileSync(path.join(SEWER_DIR, 'parsed-map.json'), 'utf8'),
);
const rooms: PRoom[] = data.rooms;
const conns: PConn[] = data.connections;
const HUB_ROW: number = data.hubRow;

const roomById = new Map<string, PRoom>();
rooms.forEach((r) => roomById.set(r.id, r));

// ==================== Section Overrides ====================
// Promote specific hub-line cross rooms to section junctions

// Find hub-line rooms that connect south to west/east sections
const southConns = new Map<string, string>(); // roomId → targetId for south connections
for (const c of conns) {
  if (c.dir === 'south') southConns.set(c.fromId, c.toId);
}

// West junction: first cross room on hub line (going from M east) that connects south to west
const hubCrossRooms = rooms
  .filter((r) => r.row === HUB_ROW && r.section === 'cross')
  .sort((a, b) => a.charStart - b.charStart);

let westJunctionId: string | null = null;
let eastJunctionId: string | null = null;

for (const r of hubCrossRooms) {
  const targetId = southConns.get(r.id);
  if (targetId) {
    const target = roomById.get(targetId);
    if (target && target.section === 'west' && !westJunctionId) {
      westJunctionId = r.id;
      r.section = 'west';
    }
  }
}

// East junction: first cross room connecting south to east section
for (const r of hubCrossRooms) {
  const targetId = southConns.get(r.id);
  if (targetId) {
    const target = roomById.get(targetId);
    if (target && target.section === 'east' && !eastJunctionId) {
      eastJunctionId = r.id;
      r.section = 'east';
    }
  }
}

console.log(`West junction: ${westJunctionId}`);
console.log(`East junction: ${eastJunctionId}`);

// ==================== Tag Assignment ====================

const tagMap = new Map<string, string>(); // roomId → tag

// Special labeled rooms
const SPECIAL_TAGS: Record<string, string> = {
  K: 'sewer_north_hub',
  D: 'sewer_drain_outflow',
  S: 'sewer_entrance_sanctum',
  M: 'sewer_west_hub',
  I: 'sewer_entrance_menagerie',
  C: 'sewer_central_hub',
  G: 'sewer_east_hub',
  W: 'sewer_entrance_warrens',
  H: 'sewer_east_crack',
  O: 'sewer_south_hub',
  B: 'sewer_blockage_1',
  T: 'sewer_entrance_tg',
  E: 'sewer_dead_end',
  Y: 'sewer_east_road_exit',
};

// Assign special tags for labeled rooms
for (const r of rooms) {
  if (r.label !== '*' && r.label !== 'F' && SPECIAL_TAGS[r.label]) {
    tagMap.set(r.id, SPECIAL_TAGS[r.label]);
  }
}

// Junction overrides
if (westJunctionId) tagMap.set(westJunctionId, 'sewer_west_junction');
if (eastJunctionId) tagMap.set(eastJunctionId, 'sewer_east_junction');

// F rooms → sewer_flooded_{N}
const fRooms = rooms
  .filter((r) => r.label === 'F')
  .sort((a, b) => a.row - b.row || a.charStart - b.charStart);
fRooms.forEach((r, i) => tagMap.set(r.id, `sewer_flooded_${i + 1}`));

// Generic * rooms — sequential within each section
// Deep south rooms near T get tg_approach tags
const TG_APPROACH_ROW_THRESHOLD = 13; // rows 13+ in south are thieves guild approach

const sectionCounters = new Map<string, number>();

// Sort rooms by row then column for consistent ordering
const sortedRooms = [...rooms].sort(
  (a, b) => a.row - b.row || a.charStart - b.charStart,
);

for (const r of sortedRooms) {
  if (tagMap.has(r.id)) continue; // already assigned

  let section = r.section;
  let prefix: string;

  // Deep south rooms near T get tg_approach tags
  if (section === 'south' && r.row >= TG_APPROACH_ROW_THRESHOLD) {
    prefix = 'sewer_tg_approach';
  } else {
    prefix = `sewer_${section}`;
  }

  const count = (sectionCounters.get(prefix) || 0) + 1;
  sectionCounters.set(prefix, count);
  tagMap.set(r.id, `${prefix}_${count}`);
}

// ==================== Validation ====================

const unassigned = rooms.filter((r) => !tagMap.has(r.id));
if (unassigned.length > 0) {
  console.error('UNASSIGNED ROOMS:');
  for (const r of unassigned) {
    console.error(
      `  ${r.id} "${r.label}" [${r.section}] at row ${r.row}, col ${r.charStart}`,
    );
  }
  process.exit(1);
}

// Count by section
const sectionCounts = new Map<string, number>();
for (const r of rooms) {
  sectionCounts.set(r.section, (sectionCounts.get(r.section) || 0) + 1);
}
console.log('\nRoom counts by section:');
for (const [s, c] of [...sectionCounts.entries()].sort()) {
  console.log(`  ${s}: ${c}`);
}

// ==================== Room Name Pools ====================

const namePool: Record<string, string[]> = {
  north: [
    'Drainage Tunnel',
    'Harbor Passage',
    'Damp Tunnel',
    'Side Passage',
    'Waterlogged Corridor',
    'Harbor Drainage',
    'Brick Tunnel',
    'Dark Passage',
    'Damp Passage',
    'Drainage Passage',
  ],
  west: [
    'Old Brick Tunnel',
    'Stained Passage',
    'Chemical Passage',
    'Crumbling Tunnel',
    'Alchemical Tunnel',
    'Stained Tunnel',
    'Old Passage',
  ],
  central: ['Sewer Passage', 'Main Tunnel', 'Central Passage', 'Sewer Tunnel'],
  east: [
    'Stone Passage',
    'Foundation Tunnel',
    'Deep Stone Tunnel',
    'Ancient Passage',
    'Heavy Tunnel',
    'Stone Corridor',
  ],
  south: [
    'Deep Tunnel',
    'Dark Passage',
    'Forgotten Passage',
    'Abandoned Tunnel',
    'Deep Passage',
    'Narrow Tunnel',
  ],
  cross: ['Sewer Tunnel', 'Connecting Passage', 'Wide Tunnel'],
};

function roomName(tag: string, section: string): string {
  const pool = namePool[section] || namePool['cross'];
  let h = 0;
  for (let i = 0; i < tag.length; i++)
    h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// ==================== Hand-Written Descriptions ====================

const handWritten: Record<string, { name: string; description: string }> = {
  sewer_north_hub: {
    name: 'Harbor Drainage Junction',
    description: `A large junction chamber beneath the harbor district. Seawater seeps steadily through the walls, mixing with the sewer flow and filling the air with the smell of brine and rot. A vertical shaft leads up to a manhole on the street far above. Tunnels branch in all directions, their walls glistening with moisture in the dim light.`,
  },
  sewer_drain_outflow: {
    name: 'Drain Outflow',
    description: `The tunnel reaches its northern terminus near the city's harbor-side foundations. A heavy iron grate is set into a thick stone wall, beyond which a drainage channel slopes downward toward the waterfront. The faint sounds of the harbor — lapping waves, creaking hulls, distant gulls — filter through the rusted bars. The grate is solid despite its age, too strong to break through. A cold sea breeze pushes in, carrying the smell of brine and open air.`,
  },
  sewer_entrance_sanctum: {
    name: 'Incense-Stained Passage',
    description: `The tunnel walls here bear strange carved symbols — angular, deliberate marks that are clearly not mason's work. The faint smell of incense hangs in the still air, incongruous in the sewer's filth. A dark opening in the wall has been framed with fitted stones, creating an archway where the rough tunnel meets something older and more purposeful beyond. Scorch marks from candles or torches blacken the stone around the entrance.`,
  },
  sewer_west_hub: {
    name: 'Sewer Tunnel',
    description: `A wide tunnel beneath the market district. Faint light seeps down through a heavy iron manhole cover far above. The air carries an acrid chemical tang — runoff from the alchemist's and dyer's shops on the street above. The brickwork here is older than elsewhere in the sewer, patched and repatched over the years.`,
  },
  sewer_west_junction: {
    name: 'Western Junction',
    description: `A junction chamber where older brick tunnels meet the main sewer line. The walls change character here — the standardized construction of the main passages giving way to rougher, older brickwork to the west. Chemical stains streak the stones in iridescent patterns.`,
  },
  sewer_entrance_menagerie: {
    name: 'Iridescent Passage',
    description: `The tunnel wall here is streaked with brilliant iridescent stains that seem to pulse with a faint inner light. The air smells of chemicals and something else — something alive and strange. A section of the wall is subtly different from the surrounding brickwork, its mortar lines not quite matching. Behind it, a faint greenish glow leaks through hairline cracks.`,
  },
  sewer_central_hub: {
    name: 'Sewer Junction',
    description: `A large vaulted chamber where four major tunnels converge. Faint grey light filters down through a heavy iron grate far above — the town square, by the sound of cart wheels and voices overhead. The stonework is solid and well-maintained this close to the surface. Water channels run along the floor in all four directions, their flow steady and purposeful.`,
  },
  sewer_east_hub: {
    name: 'Sewer Tunnel',
    description: `A sturdy tunnel beneath the garrison district. The weight of the military buildings above is evident in the massive stone blocks that form the walls. A shaft of dim light falls from a heavy manhole cover overhead, barely illuminating the passage. The air is dry and cold.`,
  },
  sewer_east_junction: {
    name: 'Eastern Junction',
    description: `A junction where the main sewer line meets tunnels that run beneath the cathedral and garrison districts. The construction is heavy here — thick stone walls and a low vaulted ceiling that bears the weight of the city's most massive buildings. A cold draft pushes through from the south.`,
  },
  sewer_entrance_warrens: {
    name: 'Vermin-Gnawed Opening',
    description: `The tunnel wall has been chewed and clawed through here, creating a ragged opening just large enough to crawl through. The edges of the hole are smooth with use, and the stench emanating from beyond is overwhelming — a concentrated reek of animal filth, matted fur, and rotting food. Faint squeaking and scratching sounds echo from the dark passage beyond.`,
  },
  sewer_east_crack: {
    name: 'Cracked Wall',
    description: `A jagged crack splits the tunnel wall here, running from floor to ceiling through ancient stonework. The gap is just wide enough for a person to squeeze through sideways. A cold, still breeze pushes through from the other side, carrying a faint otherworldly chill — the unmistakable breath of the dead. Faint pale light glows beyond the crack.`,
  },
  sewer_south_hub: {
    name: 'Deep Sewer Junction',
    description: `The tunnels descend into a deep junction where the last traces of surface light have long since vanished. A manhole shaft reaches up into impenetrable darkness above — the Southwall Road, impossibly far overhead. The air is cold and dead. Multiple tunnels branch off into the blackness, each one deeper and more forbidding than the last.`,
  },
  sewer_blockage_1: {
    name: 'Obstructed Tunnel',
    description: `The tunnel is partially blocked by a mass of debris — broken masonry, rotting timbers, and accumulated filth compressed into a solid wall. Water backs up behind the obstruction, creating a shallow, stagnant pool that stretches back down the passage. The blockage looks old but solid, and the air behind it reeks of stagnation.`,
  },
  sewer_entrance_tg: {
    name: 'Broken Conduit Chamber',
    description: `The tunnel opens into a wider chamber where a massive water conduit, cracked and broken, lies partially embedded in the floor. The pipe is wide enough for a person to enter, and its interior descends at a steep angle into darkness below the sewer level. The chamber itself is clean — swept, maintained, clearly in regular use. Torch sconces line the walls, recently used. Bootprints in the grime lead directly to the conduit's mouth.`,
  },
  sewer_dead_end: {
    name: 'Dead End',
    description: `The tunnel simply ends here in a wall of rough stone and packed earth. The construction is crude, as if the tunnelers stopped abruptly or the passage was deliberately sealed long ago. Faint scratching sounds come from behind the wall, and the stone feels oddly warm to the touch. Whatever lies beyond was not meant to be reached from this direction.`,
  },
  sewer_east_road_exit: {
    name: 'Blocked Drainage Pipe',
    description: `The tunnel widens into a low-ceilinged chamber where a large drainage pipe passes through the city's eastern foundation wall. The pipe is partially blocked by accumulated debris and rust, but faint daylight filters in from beyond. The distant sounds of the East Road — cart wheels on cobblestones, the shuffle of travelers — echo faintly through the obstruction. The pipe could potentially be cleared, but for now it remains impassable.`,
  },
  sewer_flooded_1: {
    name: 'Flooded Tunnel',
    description: `Water rises to knee height in this section of tunnel. The flooding has turned the passage into a wading channel, the current sluggish but persistent. Debris floats on the surface — scraps of wood, matted refuse, and less identifiable things. The walls are slimy above the waterline.`,
  },
  sewer_flooded_2: {
    name: 'Flooded Passage',
    description: `The flooding deepens here, dark water reaching waist-height in the lower sections. The tunnel slopes downward, and the current grows stronger, pulling at anything in its path. The walls are coated in thick green algae up to the ceiling. The air is heavy and foul.`,
  },
};

// ==================== Description Section Mapping ====================

function descSection(section: string, tag: string): string {
  if (tag.includes('flooded')) return 'flooded';
  if (tag.includes('blockage')) return 'blockage';
  if (tag.includes('tg_approach') || tag === 'sewer_entrance_tg')
    return 'tg_approach';
  return section;
}

// ==================== Exit Generation ====================

interface Exit {
  fromTag: string;
  toTag: string;
  direction: string;
}

function reverseDir(dir: string): string {
  switch (dir) {
    case 'east':
      return 'west';
    case 'west':
      return 'east';
    case 'south':
      return 'north';
    case 'north':
      return 'south';
    default:
      return dir;
  }
}

// Build all exits from connections
const allExits: Exit[] = [];
for (const c of conns) {
  const fromTag = tagMap.get(c.fromId);
  const toTag = tagMap.get(c.toId);
  if (!fromTag || !toTag) continue;

  allExits.push({ fromTag, toTag, direction: c.dir });
  allExits.push({ fromTag: toTag, toTag: fromTag, direction: reverseDir(c.dir) });
}

// Get section for a tag
function tagSection(tag: string): string {
  for (const r of rooms) {
    if (tagMap.get(r.id) === tag) return r.section;
  }
  return 'cross';
}

// Classify exits by section ownership
function exitSection(e: Exit): string {
  const fromSection = tagSection(e.fromTag);
  const toSection = tagSection(e.toTag);
  if (fromSection === toSection) return fromSection;
  return 'cross'; // cross-section exits go in cross_connections
}

// Group exits by section
const exitsBySection = new Map<string, Exit[]>();
for (const e of allExits) {
  const sec = exitSection(e);
  if (!exitsBySection.has(sec)) exitsBySection.set(sec, []);
  exitsBySection.get(sec)!.push(e);
}

// ==================== File Generation ====================

interface SectionConfig {
  section: string;
  functionName: string;
  descSectionName: string;
  extraDescFunctions?: string;
  specialExits?: Exit[];
  doors?: string;
  headerComment: string;
}

const sectionConfigs: SectionConfig[] = [
  {
    section: 'north',
    functionName: 'getNorthTunnels',
    descSectionName: 'north',
    extraDescFunctions: `
function flDesc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('flooded', tag), tag);
}`,
    headerComment: `/**
 * North Tunnels — ${sectionCounts.get('north')} rooms.
 * Harbor manhole (K, int_0_2) lands at sewer_north_hub.
 * Drain Outflow (D) at the far north — future connection outside walls.
 * Sanctum of the Damned entrance (S) in the upper-east.
 * Flooded Section (F) in the northwest — quest area.
 * Damp, waterfront seepage, brine and tide debris.
 * Level 3-4 mobs.
 */`,
    specialExits: [
      { fromTag: 'sewer_north_hub', toTag: 'int_0_2', direction: 'up' },
      { fromTag: 'int_0_2', toTag: 'sewer_north_hub', direction: 'down' },
    ],
    doors: `      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_0_2',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      }`,
  },
  {
    section: 'west',
    functionName: 'getWestTunnels',
    descSectionName: 'west',
    headerComment: `/**
 * West Tunnels — ${sectionCounts.get('west')} rooms.
 * Market manhole (M, int_2_1) lands at sewer_west_hub.
 * Older brick construction, alchemical residue, strange stains.
 * Iridescent Menagerie entrance (I) behind a false wall.
 * Level 3-5 mobs.
 */`,
    specialExits: [
      { fromTag: 'sewer_west_hub', toTag: 'int_2_1', direction: 'up' },
      { fromTag: 'int_2_1', toTag: 'sewer_west_hub', direction: 'down' },
    ],
    doors: `      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_2_1',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      }`,
  },
  {
    section: 'central',
    functionName: 'getCentralHub',
    descSectionName: 'central',
    headerComment: `/**
 * Central Hub — ${sectionCounts.get('central')} rooms.
 * Town Square manhole (C, int_2_2) lands here.
 * Safest area, some light from grates above, main junction.
 * Level 3 mobs.
 */`,
    specialExits: [
      { fromTag: 'sewer_central_hub', toTag: 'int_2_2', direction: 'up' },
      { fromTag: 'int_2_2', toTag: 'sewer_central_hub', direction: 'down' },
    ],
    doors: `      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_2_2',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      }`,
  },
  {
    section: 'east',
    functionName: 'getEastTunnels',
    descSectionName: 'east',
    headerComment: `/**
 * East Tunnels — ${sectionCounts.get('east')} rooms.
 * Garrison manhole (G, int_1_4) lands at sewer_east_hub.
 * Heavy cathedral foundations, stone masonry.
 * Halls of the Dead crack (H) enters the lower-east section.
 * Warrens of Filth entrance (W) on the far east.
 * Level 4-5 mobs.
 */`,
    specialExits: [
      { fromTag: 'sewer_east_hub', toTag: 'int_1_4', direction: 'up' },
      { fromTag: 'int_1_4', toTag: 'sewer_east_hub', direction: 'down' },
      {
        fromTag: 'sewer_east_crack',
        toTag: 'cathedral_halls_dead',
        direction: 'east',
      },
      {
        fromTag: 'cathedral_halls_dead',
        toTag: 'sewer_east_crack',
        direction: 'west',
      },
    ],
    doors: `      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_1_4',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      },
      {
        name: 'crack in the wall',
        doorType: 'triggered_passageway',
        entryTag: 'cathedral_halls_dead',
        entryDirection: 'west',
        exitTag: 'sewer_east_crack',
        exitDirection: 'east',
        defaultState: 'open',
        autoResetSeconds: 0,
        isHidden: true,
        triggerText: 'go crack',
        passageMessageSelf: 'You squeeze through the narrow crack in the wall, scraping against rough stone.',
        passageMessageRoom: '{player} squeezes through a narrow crack in the wall and disappears.',
      }`,
  },
  {
    section: 'south',
    functionName: 'getSouthTunnels',
    descSectionName: 'south',
    extraDescFunctions: `
function blDesc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('blockage', tag), tag);
}

function tgDesc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('tg_approach', tag), tag);
}`,
    headerComment: `/**
 * South Tunnels — ${sectionCounts.get('south')} rooms.
 * Southwall manhole (O, int_4_2) lands at sewer_south_hub.
 * Deepest, darkest section. Level 5-6 mobs.
 * Blockage Section (B) — quest area.
 * Thieves Guild entrance (T) — cleaner tunnels near the conduit.
 * Dead End (E) — bottom-east terminus.
 * East Road Exit (Y) — future evil escape route, dead end for now.
 */`,
    specialExits: [
      { fromTag: 'sewer_south_hub', toTag: 'int_4_2', direction: 'up' },
      { fromTag: 'int_4_2', toTag: 'sewer_south_hub', direction: 'down' },
    ],
    doors: `      {
        name: 'manhole',
        doorType: 'triggered_passageway',
        entryTag: 'int_4_2',
        entryDirection: 'down',
        defaultState: 'closed',
        autoResetSeconds: 30,
        isHidden: true,
        triggerText: 'go manhole',
        passageMessageSelf: 'You lift the heavy iron grate and climb down into the sewer.',
        passageMessageRoom: '{player} lifts a manhole grate and climbs down into the darkness below.',
      }`,
  },
  {
    section: 'cross',
    functionName: 'getCrossConnections',
    descSectionName: 'cross',
    headerComment: `/**
 * Cross-Connections — ${sectionCounts.get('cross')} rooms + inter-section exits.
 * Rooms on the hub line between section junctions.
 * Also contains all cross-section exit definitions.
 */`,
  },
];

function generateSectionFile(config: SectionConfig): string {
  // Collect rooms for this section
  const sectionRoomEntries = rooms
    .filter((r) => r.section === config.section)
    .sort((a, b) => a.row - b.row || a.charStart - b.charStart);

  // Collect exits for this section
  const sectionExits = exitsBySection.get(config.section) || [];

  // Special exits (manholes, crack, etc.)
  const specialExits = config.specialExits || [];

  // Generate room strings
  const roomStrings = sectionRoomEntries.map((r) => {
    const tag = tagMap.get(r.id)!;
    const hw = handWritten[tag];
    const name = hw ? hw.name : roomName(tag, config.section);

    if (hw) {
      return `      {
        tag: '${tag}',
        name: '${name}',
        description: \`${hw.description}\`,
        area: 'Arindale Sewer',
        terrain: 'underground',
      }`;
    }

    // Use appropriate desc function
    let descCall = `desc('${tag}')`;
    if (tag.includes('flooded')) descCall = `flDesc('${tag}')`;
    if (tag.includes('blockage')) descCall = `blDesc('${tag}')`;
    if (tag.includes('tg_approach')) descCall = `tgDesc('${tag}')`;

    return `      {
        tag: '${tag}',
        name: '${name}',
        description: ${descCall},
        area: 'Arindale Sewer',
        terrain: 'underground',
      }`;
  });

  // Generate exit strings
  const exitStrings = [
    ...specialExits.map(
      (e) =>
        `      { fromTag: '${e.fromTag}', toTag: '${e.toTag}', direction: '${e.direction}' }`,
    ),
    ...sectionExits.map(
      (e) =>
        `      { fromTag: '${e.fromTag}', toTag: '${e.toTag}', direction: '${e.direction}' }`,
    ),
  ];

  // Generate doors
  const doorsContent = config.doors ? `\n${config.doors}\n    ` : '';

  // Build file
  let file = `${config.headerComment}
import { DistrictData } from '../../arindale/types.js';
import { sewerDescription, maybeAddSewerDetail } from '../descriptions.js';

function desc(tag: string): string {
  return maybeAddSewerDetail(sewerDescription('${config.descSectionName}', tag), tag);
}
${config.extraDescFunctions || ''}
export function ${config.functionName}(): DistrictData {
  return {
    rooms: [
${roomStrings.join(',\n')},
    ],

    exits: [
${exitStrings.join(',\n')},
    ],

    doors: [${doorsContent}],
  };
}
`;

  return file;
}

// ==================== Write Files ====================

for (const config of sectionConfigs) {
  const filename = {
    north: 'north_tunnels.ts',
    west: 'west_tunnels.ts',
    central: 'central_hub.ts',
    east: 'east_tunnels.ts',
    south: 'south_tunnels.ts',
    cross: 'cross_connections.ts',
  }[config.section]!;

  const content = generateSectionFile(config);
  const filepath = path.join(SEWER_DIR, 'sections', filename);
  fs.writeFileSync(filepath, content);
  console.log(`Wrote ${filename} (${content.split('\n').length} lines)`);
}

// ==================== Summary ====================

console.log('\n=== GENERATION SUMMARY ===');
console.log(`Total rooms: ${tagMap.size}`);
console.log(`Total exits: ${allExits.length}`);
console.log(`Cross-section exits: ${(exitsBySection.get('cross') || []).length}`);

// Verify all parser connections are represented
const exitSet = new Set(
  allExits.map((e) => `${e.fromTag}|${e.toTag}|${e.direction}`),
);
console.log(`Unique exit entries: ${exitSet.size}`);

// Check for duplicate exits
for (const [section, exits] of exitsBySection) {
  const seen = new Set<string>();
  for (const e of exits) {
    const key = `${e.fromTag}|${e.toTag}|${e.direction}`;
    if (seen.has(key)) {
      console.warn(`WARNING: Duplicate exit in ${section}: ${key}`);
    }
    seen.add(key);
  }
}

// Print tag mapping for reference
console.log('\n=== TAG MAPPING ===');
for (const r of sortedRooms) {
  const tag = tagMap.get(r.id)!;
  if (r.label !== '*') {
    console.log(
      `  ${r.id} [${r.section}] "${r.label}" → ${tag}`,
    );
  }
}
