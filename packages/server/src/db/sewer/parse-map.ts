/**
 * ASCII map parser — extracts rooms and connections from the sewer plan.
 * Run: npx tsx packages/server/src/db/sewer/parse-map.ts
 *
 * Updated for single-character room labels (K, M, C, G, O, etc.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

interface Room {
  id: string;
  row: number;
  charStart: number;
  charEnd: number;
  label: string;
  section?: string;
}

interface Connection {
  fromId: string;
  toId: string;
  dir: 'east' | 'south';
}

// Single-character room labels from the map legend
const LABELS = new Set([
  'D', 'K', 'F', 'S', 'W', 'M', 'C', 'G', 'I', 'H', 'O', 'B', 'T', 'E', 'Y',
]);

const rawContent = fs.readFileSync(
  path.join(PROJECT_ROOT, 'areas/arindale_sewer/plan.md'),
  'utf8',
);
const content = rawContent.replace(/\r\n/g, '\n');

// Extract map between ``` markers
const mapBlockStart = content.indexOf('```\nARINDALE SEWER');
if (mapBlockStart === -1) {
  console.error('ERROR: Could not find ARINDALE SEWER map block');
  process.exit(1);
}
const mapContentStart =
  content.indexOf('\n', content.indexOf('\n', mapBlockStart) + 1) + 1;
const mapContentEnd = content.indexOf('```', mapContentStart);
const mapText = content.substring(mapContentStart, mapContentEnd);
const allLines = mapText.split('\n');

// Find "North" marker and start after it (skip the legend block)
let startIdx = 0;
for (let i = 0; i < allLines.length; i++) {
  if (allLines[i].includes('North')) {
    startIdx = i + 1;
    break;
  }
}
const mapLines = allLines.slice(startIdx);

// Separate room lines and pipe lines
const roomLineData: { idx: number; text: string; row: number }[] = [];
const pipeLineData: {
  idx: number;
  text: string;
  aboveRow: number;
  belowRow: number;
}[] = [];
let rowCounter = 0;

for (let i = 0; i < mapLines.length; i++) {
  const line = mapLines[i];
  if (line.trim() === '') continue;

  const isPipes = /^[\s|]+$/.test(line);
  // A room line contains * or any label character
  const hasRoom =
    !isPipes &&
    (/\*/.test(line) || [...line].some((ch) => LABELS.has(ch)));

  if (hasRoom) {
    roomLineData.push({ idx: i, text: line, row: rowCounter });
    rowCounter++;
  } else if (isPipes) {
    pipeLineData.push({
      idx: i,
      text: line,
      aboveRow: rowCounter - 1,
      belowRow: rowCounter,
    });
  }
}

// Parse rooms from each room line
const rooms: Room[] = [];

for (const rl of roomLineData) {
  const { text, row } = rl;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '*') {
      rooms.push({
        id: `r${row}_${i}`,
        row,
        charStart: i,
        charEnd: i,
        label: '*',
      });
    } else if (LABELS.has(ch)) {
      rooms.push({
        id: `r${row}_${i}`,
        row,
        charStart: i,
        charEnd: i,
        label: ch,
      });
    }
  }
}

// Group rooms by row
const roomsByRow = new Map<number, Room[]>();
for (const r of rooms) {
  if (!roomsByRow.has(r.row)) roomsByRow.set(r.row, []);
  roomsByRow.get(r.row)!.push(r);
}
for (const rowRooms of roomsByRow.values()) {
  rowRooms.sort((a, b) => a.charStart - b.charStart);
}

// Horizontal connections: check for - between adjacent rooms on same row
const connections: Connection[] = [];

for (const rl of roomLineData) {
  const rowRooms = roomsByRow.get(rl.row) || [];
  for (let i = 0; i < rowRooms.length - 1; i++) {
    const left = rowRooms[i];
    const right = rowRooms[i + 1];
    const between = rl.text.substring(left.charEnd + 1, right.charStart);
    if (
      between.length > 0 &&
      /^-+$/.test(between.trim()) &&
      between.includes('-')
    ) {
      connections.push({ fromId: left.id, toId: right.id, dir: 'east' });
    }
  }
}

// Vertical connections: match | positions to rooms above and below
function center(r: Room): number {
  return (r.charStart + r.charEnd) / 2;
}

for (const pl of pipeLineData) {
  const aboveRooms = roomsByRow.get(pl.aboveRow) || [];
  const belowRooms = roomsByRow.get(pl.belowRow) || [];

  const pipePositions: number[] = [];
  for (let i = 0; i < pl.text.length; i++) {
    if (pl.text[i] === '|') pipePositions.push(i);
  }

  const matchedAbove = new Set<string>();
  const matchedBelow = new Set<string>();

  for (const pp of pipePositions) {
    let bestAbove: Room | null = null;
    let bestAboveDist = Infinity;
    for (const r of aboveRooms) {
      if (matchedAbove.has(r.id)) continue;
      const d = Math.abs(pp - center(r));
      if (d < bestAboveDist && d <= 8) {
        bestAboveDist = d;
        bestAbove = r;
      }
    }

    let bestBelow: Room | null = null;
    let bestBelowDist = Infinity;
    for (const r of belowRooms) {
      if (matchedBelow.has(r.id)) continue;
      const d = Math.abs(pp - center(r));
      if (d < bestBelowDist && d <= 8) {
        bestBelowDist = d;
        bestBelow = r;
      }
    }

    if (bestAbove && bestBelow) {
      connections.push({
        fromId: bestAbove.id,
        toId: bestBelow.id,
        dir: 'south',
      });
      matchedAbove.add(bestAbove.id);
      matchedBelow.add(bestBelow.id);
    }
  }
}

// ==================== Section Assignment ====================

// Find hub line — the row containing M, C, G
const HUB_ROW = roomLineData.findIndex((rl) =>
  (roomsByRow.get(rl.row) || []).some((r) => r.label === 'C'),
);

const hubRooms = roomsByRow.get(HUB_ROW) || [];
const hubM = hubRooms.find((r) => r.label === 'M')!;
const hubC = hubRooms.find((r) => r.label === 'C')!;
const hubG = hubRooms.find((r) => r.label === 'G')!;

if (!hubM || !hubC || !hubG) {
  console.error('ERROR: Could not find M, C, G on hub line');
  process.exit(1);
}

const mCenter = center(hubM);
const cCenter = center(hubC);
const gCenter = center(hubG);

// Section boundaries for below-hub column assignment
const WEST_BOUND = (mCenter + cCenter) / 2;
const EAST_BOUND = (cCenter + gCenter) / 2;
const CENTRAL_ROW_LIMIT = HUB_ROW + 3;

// Explicit label → section mapping
const LABEL_SECTIONS: Record<string, string> = {
  D: 'north',
  K: 'north',
  F: 'north',
  S: 'north',
  M: 'west',
  I: 'west',
  C: 'central',
  G: 'east',
  W: 'east',
  H: 'east',
  O: 'south',
  B: 'south',
  T: 'south',
  E: 'south',
  Y: 'south',
};

function assignSection(r: Room): string {
  // Labeled rooms get explicit sections
  if (r.label !== '*' && LABEL_SECTIONS[r.label]) {
    return LABEL_SECTIONS[r.label];
  }

  // Above hub → north
  if (r.row < HUB_ROW) return 'north';

  // Hub line
  if (r.row === HUB_ROW) {
    const c = center(r);
    if (c === mCenter) return 'west';
    if (c === cCenter) return 'central';
    if (c === gCenter) return 'east';
    return 'cross';
  }

  // Below hub — column-based with central/south split by row depth
  const c = center(r);
  if (c < WEST_BOUND) return 'west';
  if (c >= EAST_BOUND) return 'east';

  // Central column: shallow → central, deep → south
  if (r.row <= CENTRAL_ROW_LIMIT) return 'central';
  return 'south';
}

// Assign sections to all rooms
for (const r of rooms) {
  r.section = assignSection(r);
}

// ==================== Output ====================

console.log(`=== PARSED SEWER MAP ===`);
console.log(`Hub line row: ${HUB_ROW} (M@${mCenter}, C@${cCenter}, G@${gCenter})`);
console.log(`Section bounds: west<${WEST_BOUND}, east>=${EAST_BOUND}, central rows<=${CENTRAL_ROW_LIMIT}`);
console.log(`Total rooms: ${rooms.length}`);
console.log(
  `Total connections: ${connections.length} (${connections.filter((c) => c.dir === 'east').length} E-W, ${connections.filter((c) => c.dir === 'south').length} N-S)`,
);
console.log();

// Count by section
const sectionCounts = new Map<string, number>();
for (const r of rooms) {
  const s = r.section!;
  sectionCounts.set(s, (sectionCounts.get(s) || 0) + 1);
}
console.log('Rooms by section:');
for (const [s, c] of [...sectionCounts.entries()].sort()) {
  console.log(`  ${s}: ${c}`);
}
console.log();

// Output rooms by row with section assignment
for (const [row, rowRooms] of [...roomsByRow.entries()].sort(
  (a, b) => a[0] - b[0],
)) {
  console.log(`Row ${row} (${rowRooms.length} rooms):`);
  for (const r of rowRooms) {
    console.log(
      `  ${r.id} [${r.section}] "${r.label}" at col ${r.charStart}`,
    );
  }
}
console.log();

// Output connections
console.log('Connections:');
for (const c of connections) {
  const from = rooms.find((r) => r.id === c.fromId)!;
  const to = rooms.find((r) => r.id === c.toId)!;
  const arrow = c.dir === 'east' ? '→E→' : '→S→';
  console.log(
    `  ${from.label}(${from.id}) [${from.section}] ${arrow} ${to.label}(${to.id}) [${to.section}]`,
  );
}

// Validation: check for rooms with no connections
const connectedIds = new Set<string>();
for (const c of connections) {
  connectedIds.add(c.fromId);
  connectedIds.add(c.toId);
}
const isolated = rooms.filter((r) => !connectedIds.has(r.id));
if (isolated.length > 0) {
  console.log(
    `\nWARNING: ${isolated.length} isolated rooms (no connections):`,
  );
  for (const r of isolated) {
    console.log(`  ${r.id} "${r.label}" at row ${r.row}, col ${r.charStart}`);
  }
}

// Output as JSON for machine consumption
const output = {
  rooms: rooms.map((r) => ({ ...r })),
  connections,
  hubRow: HUB_ROW,
};
fs.writeFileSync(
  path.join(__dirname, 'parsed-map.json'),
  JSON.stringify(output, null, 2),
);
console.log('\nJSON written to packages/server/src/db/sewer/parsed-map.json');
