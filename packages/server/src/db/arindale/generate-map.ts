/**
 * Arindale ANSI Map Generator
 *
 * Generates text-based maps from room/exit data for spatial validation.
 * Output format follows MajorMUD map conventions (maps.mud.fyi).
 *
 * Usage: npx tsx packages/server/src/db/arindale/generate-map.ts
 * Output: maps/arindale.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateGrid } from './grid.js';
import { getMarketDistrict } from './districts/market.js';
import { getCathedralDistrict } from './districts/cathedral.js';
import { getGarrisonDistrict } from './districts/garrison.js';
import { getHarborDistrict } from './districts/harbor.js';
import { getParkDistrict } from './districts/park.js';
import { getResidentialDistrict } from './districts/residential.js';
import { getWallsDistrict } from './districts/walls.js';
import { RoomDef, ExitDef, DistrictData } from './types.js';
import { EW_STREETS, NS_STREETS } from './descriptions.js';

// ── Types ─────────────────────────────────────────────────────────────

interface PlacedRoom {
  tag: string;
  name: string;
  x: number;
  y: number;
  level: number;
  symbol: string;
  isGrid: boolean;
  hasVertical: boolean;
}

interface Conflict {
  tag: string;
  name: string;
  x: number;
  y: number;
  level: number;
  occupiedBy: string;
  occupiedByName: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const DIR_OFFSETS: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east:  { dx: 1, dy: 0 },
  west:  { dx: -1, dy: 0 },
};

// Room symbol rules — first match wins
function getRoomSymbol(tag: string, room: RoomDef): string {
  if (tag === 'int_2_2') return '@';
  const f = room.features as Record<string, unknown> | undefined;
  if (f?.bank) return 'B';
  if (f?.training) return 'T';
  if (f?.respawn) return 'H';
  if (/jail_cell/.test(tag)) return 'J';
  if (/^gate_/.test(tag)) return 'G';
  if (tag === 'castle_drawbridge') return 'D';
  if (/^harbor_tavern/.test(tag)) return 'V';
  if (/^harbor_inn/.test(tag)) return 'I';
  if (/^harbor_dock/.test(tag)) return 'K';
  if (/^harbor_warehouse/.test(tag)) return 'w';
  if (/^park_/.test(tag)) return 'P';
  if (tag === 'garrison_sheriff') return 'S';
  if (tag === 'garrison_mayor') return 'M';
  if (/^garrison_barracks/.test(tag)) return 'b';
  if (/^cathedral_/.test(tag)) return '+';
  if (/^market_/.test(tag)) return '$';
  if (/^residential_/.test(tag)) return 'R';
  if (/^wall_/.test(tag)) return 'W';
  if (/^castle_road/.test(tag)) return 'c';
  return '*';
}

// ── Data collection ───────────────────────────────────────────────────

function collectAll() {
  const grid = generateGrid();
  const districts: DistrictData[] = [
    getMarketDistrict(),
    getCathedralDistrict(),
    getGarrisonDistrict(),
    getHarborDistrict(),
    getParkDistrict(),
    getResidentialDistrict(),
    getWallsDistrict(),
  ];

  const rooms = new Map<string, RoomDef>();
  const exits: ExitDef[] = [];

  for (const r of grid.rooms) rooms.set(r.tag, r);
  for (const e of grid.exits) exits.push(e);

  for (const d of districts) {
    for (const r of d.rooms) rooms.set(r.tag, r);
    for (const e of d.exits) exits.push(e);
  }

  return { rooms, exits };
}

// ── Coordinate helpers ────────────────────────────────────────────────

function gridTagToCoords(tag: string): { x: number; y: number } | null {
  let m = tag.match(/^int_(\d+)_(\d+)$/);
  if (m) return { x: parseInt(m[2]) * 4, y: parseInt(m[1]) * 4 };

  m = tag.match(/^ew_(\d+)_(\d+)_(\d+)$/);
  if (m) return { x: parseInt(m[2]) * 4 + parseInt(m[3]), y: parseInt(m[1]) * 4 };

  m = tag.match(/^ns_(\d+)_(\d+)_(\d+)$/);
  if (m) return { x: parseInt(m[1]) * 4, y: parseInt(m[2]) * 4 + parseInt(m[3]) };

  return null;
}

function posKey(level: number, x: number, y: number): string {
  return `${level}:${x}:${y}`;
}

// ── Room placement ────────────────────────────────────────────────────

function placeRooms(rooms: Map<string, RoomDef>, exits: ExitDef[]) {
  // Build adjacency (from → exits[])
  const adjFrom = new Map<string, ExitDef[]>();
  for (const e of exits) {
    if (!adjFrom.has(e.fromTag)) adjFrom.set(e.fromTag, []);
    adjFrom.get(e.fromTag)!.push(e);
  }

  // Track rooms with up/down exits
  const verticalRooms = new Set<string>();
  for (const e of exits) {
    if (e.direction === 'up' || e.direction === 'down') {
      verticalRooms.add(e.fromTag);
    }
  }

  const placed = new Map<string, PlacedRoom>();
  const occupied = new Map<string, string>(); // posKey → tag
  const conflicts: Conflict[] = [];

  // Phase 1: Place grid rooms (deterministic coordinates)
  for (const [tag, room] of rooms) {
    const coords = gridTagToCoords(tag);
    if (!coords) continue;

    const pr: PlacedRoom = {
      tag, name: room.name,
      x: coords.x, y: coords.y, level: 0,
      symbol: getRoomSymbol(tag, room),
      isGrid: true,
      hasVertical: verticalRooms.has(tag),
    };
    placed.set(tag, pr);
    occupied.set(posKey(0, coords.x, coords.y), tag);
  }

  // Phase 2: BFS to place building rooms
  const queue: string[] = [...placed.keys()];

  while (queue.length > 0) {
    const currentTag = queue.shift()!;
    const current = placed.get(currentTag)!;
    const exitsFrom = adjFrom.get(currentTag) || [];

    for (const exit of exitsFrom) {
      if (placed.has(exit.toTag)) continue;
      if (!rooms.has(exit.toTag)) continue;

      let nx = current.x, ny = current.y, nl = current.level;

      if (exit.direction === 'up') {
        nl += 1;
      } else if (exit.direction === 'down') {
        nl -= 1;
      } else {
        const offset = DIR_OFFSETS[exit.direction];
        if (!offset) continue;
        nx += offset.dx;
        ny += offset.dy;
      }

      const pk = posKey(nl, nx, ny);
      const room = rooms.get(exit.toTag)!;

      if (occupied.has(pk)) {
        const occTag = occupied.get(pk)!;
        const occRoom = placed.get(occTag)!;
        conflicts.push({
          tag: exit.toTag,
          name: room.name,
          x: nx, y: ny, level: nl,
          occupiedBy: occTag,
          occupiedByName: occRoom.name,
        });
      }

      const pr: PlacedRoom = {
        tag: exit.toTag, name: room.name,
        x: nx, y: ny, level: nl,
        symbol: getRoomSymbol(exit.toTag, room),
        isGrid: false,
        hasVertical: verticalRooms.has(exit.toTag),
      };
      placed.set(exit.toTag, pr);
      if (!occupied.has(pk)) {
        occupied.set(pk, exit.toTag);
      }
      queue.push(exit.toTag);
    }
  }

  // Check for unplaced rooms
  const unplaced: string[] = [];
  for (const tag of rooms.keys()) {
    if (!placed.has(tag)) unplaced.push(tag);
  }

  return { placed, occupied, conflicts, unplaced };
}

// ── Rendering ─────────────────────────────────────────────────────────

function renderLevel(
  levelName: string,
  level: number,
  placed: Map<string, PlacedRoom>,
  occupied: Map<string, string>,
  exits: ExitDef[],
  showStreetLabels: boolean,
): string {
  // Collect renderable rooms (first-placed at each position)
  const levelRooms: PlacedRoom[] = [];
  for (const [tag, room] of placed) {
    if (room.level !== level) continue;
    const pk = posKey(level, room.x, room.y);
    if (occupied.get(pk) === tag) {
      levelRooms.push(room);
    }
  }

  if (levelRooms.length === 0) return '';

  // Bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of levelRooms) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y);
  }

  // Padding: extra space on left for street labels
  const labelW = showStreetLabels ? 18 : 4;
  const padR = 4;
  const padT = showStreetLabels ? 3 : 1;
  const padB = 1;

  const gridW = (maxX - minX) * 4 + 1;
  const gridH = (maxY - minY) * 2 + 1;
  const totalW = gridW + labelW + padR;
  const totalH = gridH + padT + padB;

  // Create char grid
  const grid: string[][] = Array.from({ length: totalH }, () =>
    Array(totalW).fill(' '),
  );

  // Coord helpers
  const cx = (x: number) => (x - minX) * 4 + labelW;
  const cy = (y: number) => (y - minY) * 2 + padT;

  // Place column header labels (N/S street names) for ground level
  if (showStreetLabels) {
    for (let col = 0; col < 5; col++) {
      const x = col * 4; // grid x for this column
      if (x < minX || x > maxX) continue;
      const charCol = cx(x);
      const name = NS_STREETS[col];
      // Abbreviate to fit: first word or short form
      const abbr = abbreviateStreet(name);
      // Place centered above the column
      const startCol = charCol - Math.floor(abbr.length / 2);
      for (let i = 0; i < abbr.length; i++) {
        const c = startCol + i;
        if (c >= 0 && c < totalW) {
          grid[0][c] = abbr[i];
        }
      }
    }
  }

  // Place row labels (E/W street names)
  if (showStreetLabels) {
    for (let row = 0; row < 5; row++) {
      const y = row * 4; // grid y for this row
      if (y < minY || y > maxY) continue;
      const charRow = cy(y);
      const name = EW_STREETS[row];
      const abbr = abbreviateStreet(name);
      // Place right-aligned to the left of the grid
      const startCol = labelW - 2 - abbr.length;
      for (let i = 0; i < abbr.length; i++) {
        const c = startCol + i;
        if (c >= 0 && c < totalW && charRow >= 0 && charRow < totalH) {
          grid[charRow][c] = abbr[i];
        }
      }
    }
  }

  // Place rooms
  for (const r of levelRooms) {
    const col = cx(r.x);
    const row = cy(r.y);
    if (row >= 0 && row < totalH && col >= 0 && col < totalW) {
      const sym = (r.hasVertical && r.symbol === '*') ? '%' : r.symbol;
      grid[row][col] = sym;
    }
  }

  // Place connections
  for (const e of exits) {
    const from = placed.get(e.fromTag);
    const to = placed.get(e.toTag);
    if (!from || !to) continue;
    if (from.level !== level || to.level !== level) continue;

    const dir = e.direction;
    if (dir === 'up' || dir === 'down') continue;

    const offset = DIR_OFFSETS[dir];
    if (!offset) continue;

    // Verify rooms are actually adjacent
    if (to.x !== from.x + offset.dx || to.y !== from.y + offset.dy) continue;

    // Only draw if at least one room is visible at its position
    const fromPk = posKey(level, from.x, from.y);
    const toPk = posKey(level, to.x, to.y);
    const fromVisible = occupied.get(fromPk) === from.tag;
    const toVisible = occupied.get(toPk) === to.tag;
    if (!fromVisible && !toVisible) continue;

    // Draw connection at midpoint
    if (dir === 'east' || dir === 'west') {
      const midCol = Math.min(cx(from.x), cx(to.x)) + 2;
      const midRow = cy(from.y);
      if (midRow >= 0 && midRow < totalH && midCol >= 0 && midCol < totalW) {
        grid[midRow][midCol] = '-';
      }
    } else if (dir === 'north' || dir === 'south') {
      const midRow = Math.min(cy(from.y), cy(to.y)) + 1;
      const midCol = cx(from.x);
      if (midRow >= 0 && midRow < totalH && midCol >= 0 && midCol < totalW) {
        grid[midRow][midCol] = '|';
      }
    }
  }

  // Build output with border
  const contentW = totalW;
  const borderW = contentW + 2;
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${levelName}`);
  lines.push(`  (${levelRooms.length} rooms)`);
  lines.push('');
  lines.push('+' + '-'.repeat(borderW - 2) + '+');
  for (let row = 0; row < totalH; row++) {
    // Trim trailing spaces for cleaner output
    const rowStr = grid[row].join('');
    lines.push('|' + rowStr + '|');
  }
  lines.push('+' + '-'.repeat(borderW - 2) + '+');

  return lines.join('\n');
}

function abbreviateStreet(name: string): string {
  return name
    .replace('Street', 'St')
    .replace('Road', 'Rd');
}

// ── Street grid annotation ────────────────────────────────────────────

function generateStreetGridNote(): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  STREET GRID REFERENCE');
  lines.push('  ' + '-'.repeat(50));
  lines.push('');
  lines.push('  Row 0 (y= 0): Harbor Road       (northernmost)');
  lines.push('  Row 1 (y= 4): Marshal Street');
  lines.push('  Row 2 (y= 8): Main Street        (Town Square row)');
  lines.push('  Row 3 (y=12): Cloister Court');
  lines.push('  Row 4 (y=16): Southwall Road     (southernmost)');
  lines.push('');
  lines.push('  Col 0 (x= 0): Westwall Street    (westernmost)');
  lines.push('  Col 1 (x= 4): Market Street');
  lines.push('  Col 2 (x= 8): King\'s Road        (Town Square column)');
  lines.push('  Col 3 (x=12): Cathedral Lane');
  lines.push('  Col 4 (x=16): Eastwall Street     (easternmost)');
  lines.push('');
  lines.push('  Intersections at (col*4, row*4). 3 mid-street rooms between each.');
  lines.push('  Buildings extend into block interiors from their street entry points.');
  return lines.join('\n');
}

// ── Legend ─────────────────────────────────────────────────────────────

function generateLegend(): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  LEGEND');
  lines.push('  ' + '-'.repeat(50));
  lines.push('');
  lines.push('  Rooms:');
  lines.push('    @  Town Square');
  lines.push('    *  Street / Generic Room');
  lines.push('    %  Room with Up/Down access');
  lines.push('');
  lines.push('  Districts:');
  lines.push('    $  Market — Shop / Merchant');
  lines.push('    B  Market — Bank');
  lines.push('    +  Cathedral / Church / Crypt');
  lines.push('    H  Halls of the Dead (Respawn)');
  lines.push('    T  Garrison — Training Room');
  lines.push('    S  Garrison — Sheriff\'s Office');
  lines.push('    M  Garrison — Mayor\'s Office');
  lines.push('    J  Garrison — Jail Cell');
  lines.push('    b  Garrison — Barracks');
  lines.push('    V  Harbor — Tavern');
  lines.push('    I  Harbor — Inn');
  lines.push('    K  Harbor — Dock');
  lines.push('    w  Harbor — Warehouse');
  lines.push('    P  Park');
  lines.push('    R  Residential');
  lines.push('    G  City Gate');
  lines.push('    D  Castle Drawbridge');
  lines.push('    W  Wall Walk / Guard Tower');
  lines.push('    c  Castle Road');
  lines.push('');
  lines.push('  Connections:');
  lines.push('    -  East/West passage');
  lines.push('    |  North/South passage');
  lines.push('    %  Up/Down access (see room index for details)');
  return lines.join('\n');
}

// ── Room index ────────────────────────────────────────────────────────

function generateRoomIndex(
  placed: Map<string, PlacedRoom>,
  exits: ExitDef[],
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  BUILDING ROOM INDEX');
  lines.push('  ' + '-'.repeat(60));

  // Build vertical exit info
  const vertExits = new Map<string, string[]>();
  for (const e of exits) {
    if (e.direction === 'up' || e.direction === 'down') {
      if (!vertExits.has(e.fromTag)) vertExits.set(e.fromTag, []);
      vertExits.get(e.fromTag)!.push(`${e.direction} → ${e.toTag}`);
    }
  }

  // Group by district
  const districts: Record<string, PlacedRoom[]> = {};
  for (const r of placed.values()) {
    if (r.isGrid) continue;
    const prefix = r.tag.split('_')[0];
    const district = {
      market: 'Market',
      cathedral: 'Cathedral',
      garrison: 'Garrison',
      harbor: 'Harbor',
      park: 'Park',
      residential: 'Residential',
      gate: 'Gates & Walls',
      wall: 'Gates & Walls',
      castle: 'Gates & Walls',
    }[prefix] || 'Other';
    if (!districts[district]) districts[district] = [];
    districts[district].push(r);
  }

  for (const [district, rooms] of Object.entries(districts)) {
    lines.push('');
    lines.push(`  ${district}:`);
    const sorted = rooms.sort((a, b) => {
      if (a.level !== b.level) return b.level - a.level;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    for (const r of sorted) {
      const lbl = r.level !== 0 ? ` [L${r.level}]` : '';
      const vert = vertExits.get(r.tag);
      const vertStr = vert ? `  {${vert.join(', ')}}` : '';
      lines.push(`    ${r.symbol}  (${String(r.x).padStart(2)},${String(r.y).padStart(2)})${lbl}  ${r.name.padEnd(30)} [${r.tag}]${vertStr}`);
    }
  }

  return lines.join('\n');
}

// ── Conflict report ───────────────────────────────────────────────────

function generateConflictReport(conflicts: Conflict[]): string {
  if (conflicts.length === 0) {
    const lines: string[] = [];
    lines.push('');
    lines.push('  MAP CONFLICTS: None');
    return lines.join('\n');
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  MAP CONFLICTS (rooms sharing same grid position)');
  lines.push('  ' + '-'.repeat(60));

  // Separate street-overlap conflicts from building-building conflicts
  const streetConflicts: Conflict[] = [];
  const buildingConflicts: Conflict[] = [];
  for (const c of conflicts) {
    if (gridTagToCoords(c.occupiedBy)) {
      streetConflicts.push(c);
    } else {
      buildingConflicts.push(c);
    }
  }

  if (streetConflicts.length > 0) {
    lines.push('');
    lines.push('  !! STREET OVERLAPS (building room on a street position):');
    for (const c of streetConflicts) {
      lines.push(`     (${c.x},${c.y}) L${c.level}: "${c.name}" [${c.tag}]`);
      lines.push(`       overlaps STREET room "${c.occupiedByName}" [${c.occupiedBy}]`);
    }
  }

  if (buildingConflicts.length > 0) {
    lines.push('');
    lines.push('  Building density overlaps (two buildings share a block position):');
    for (const c of buildingConflicts) {
      lines.push(`     (${c.x},${c.y}) L${c.level}: "${c.name}" [${c.tag}]`);
      lines.push(`       overlaps "${c.occupiedByName}" [${c.occupiedBy}]`);
    }
  }

  lines.push('');
  lines.push('  Street overlaps indicate a building extends into an adjacent street');
  lines.push('  and should be reviewed. Building density overlaps are expected when');
  lines.push('  multiple buildings share a city block interior.');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  console.log('=== Arindale Map Generator ===\n');

  const { rooms, exits } = collectAll();
  console.log(`  Rooms: ${rooms.size}`);
  console.log(`  Exits: ${exits.length}`);

  const { placed, occupied, conflicts, unplaced } = placeRooms(rooms, exits);
  console.log(`  Placed: ${placed.size}`);
  console.log(`  Conflicts: ${conflicts.length}`);
  console.log(`  Unplaced: ${unplaced.length}`);

  // Determine levels
  const levels = new Set<number>();
  for (const r of placed.values()) levels.add(r.level);
  const sortedLevels = [...levels].sort((a, b) => b - a);

  const levelNames: Record<number, string> = {
    1: 'Arindale — Upper Level (City Walls & Upper Floors)',
    0: 'Arindale — Ground Level',
    [-1]: 'Arindale — Below Ground (Level 1)',
    [-2]: 'Arindale — Below Ground (Level 2)',
    [-3]: 'Arindale — Below Ground (Level 3)',
    [-4]: 'Arindale — Below Ground (Level 4)',
  };

  // Build output
  const sections: string[] = [];

  // Header
  sections.push('='.repeat(80));
  sections.push('  ARINDALE CITY MAP');
  sections.push('  Generated for spatial validation');
  sections.push('  Format follows MajorMUD map conventions (maps.mud.fyi)');
  sections.push('='.repeat(80));

  // Render each level
  for (const level of sortedLevels) {
    const name = levelNames[level] || `Arindale — Level ${level}`;
    const showLabels = level === 0; // only show street labels on ground level
    const rendered = renderLevel(name, level, placed, occupied, exits, showLabels);
    if (rendered) sections.push(rendered);
  }

  // Reference sections
  sections.push(generateStreetGridNote());
  sections.push(generateLegend());
  sections.push(generateRoomIndex(placed, exits));
  sections.push(generateConflictReport(conflicts));

  // Unplaced rooms
  if (unplaced.length > 0) {
    sections.push('');
    sections.push('  UNPLACED ROOMS (disconnected from grid)');
    sections.push('  ' + '-'.repeat(40));
    for (const tag of unplaced) {
      sections.push(`  ? ${tag} — ${rooms.get(tag)!.name}`);
    }
  }

  sections.push('');
  sections.push('='.repeat(80));

  const output = sections.join('\n');

  // Write to maps/
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), '../../../../..');
  const mapsDir = path.join(projectRoot, 'maps');

  if (!fs.existsSync(mapsDir)) {
    fs.mkdirSync(mapsDir, { recursive: true });
  }

  const outPath = path.join(mapsDir, 'arindale.txt');
  fs.writeFileSync(outPath, output, 'utf-8');

  console.log(`\n  Map written to: ${outPath}`);
  console.log(`  Total lines: ${output.split('\n').length}`);

  const streetConflicts = conflicts.filter(c => gridTagToCoords(c.occupiedBy) !== null);
  const buildingConflicts = conflicts.filter(c => gridTagToCoords(c.occupiedBy) === null);

  if (streetConflicts.length > 0) {
    console.log(`\n  !! ${streetConflicts.length} STREET OVERLAP(S) detected — review required!`);
  }
  if (buildingConflicts.length > 0) {
    console.log(`  ${buildingConflicts.length} building density overlap(s) — expected for dense blocks.`);
  }
  if (conflicts.length === 0) {
    console.log(`\n  No map conflicts detected.`);
  }
}

main();
