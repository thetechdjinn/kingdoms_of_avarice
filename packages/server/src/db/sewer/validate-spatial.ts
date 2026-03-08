/**
 * Spatial consistency validator for sewer seed data.
 * Assigns grid coordinates via BFS and checks that
 * east-then-south == south-then-east for all rooms.
 *
 * Run: npx tsx packages/server/src/db/sewer/validate-spatial.ts
 */
import { getCentralHub } from './sections/central_hub.js';
import { getNorthTunnels } from './sections/north_tunnels.js';
import { getWestTunnels } from './sections/west_tunnels.js';
import { getEastTunnels } from './sections/east_tunnels.js';
import { getSouthTunnels } from './sections/south_tunnels.js';
import { getCrossConnections } from './sections/cross_connections.js';

const sections = [
  getCentralHub(),
  getNorthTunnels(),
  getWestTunnels(),
  getEastTunnels(),
  getSouthTunnels(),
  getCrossConnections(),
];

// Build adjacency: tag → direction → tag
const adj = new Map<string, Map<string, string>>();
const allTags = new Set<string>();

for (const s of sections) {
  for (const r of s.rooms) allTags.add(r.tag);
  for (const e of s.exits) {
    if (!adj.has(e.fromTag)) adj.set(e.fromTag, new Map());
    adj.get(e.fromTag)!.set(e.direction, e.toTag);
  }
}

// Only check cardinal directions for grid consistency
const OPPOSITE: Record<string, string> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
};

// Assign coordinates via BFS from sewer_central_hub
const DELTAS: Record<string, [number, number]> = {
  east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1],
};

const coords = new Map<string, [number, number]>();
const posToTag = new Map<string, string>();

const queue: string[] = ['sewer_central_hub'];
coords.set('sewer_central_hub', [0, 0]);
posToTag.set('0,0', 'sewer_central_hub');

let conflicts = 0;

while (queue.length > 0) {
  const tag = queue.shift()!;
  const [x, y] = coords.get(tag)!;
  const exits = adj.get(tag);
  if (!exits) continue;

  for (const [dir, toTag] of exits) {
    if (dir === 'up' || dir === 'down') continue;
    // Skip exits to rooms outside the sewer (Arindale surface rooms)
    if (!allTags.has(toTag)) continue;
    const delta = DELTAS[dir];
    if (!delta) continue;

    const nx = x + delta[0];
    const ny = y + delta[1];
    const posKey = `${nx},${ny}`;

    if (coords.has(toTag)) {
      // Already placed — verify coordinates match
      const [ex, ey] = coords.get(toTag)!;
      if (ex !== nx || ey !== ny) {
        console.error(
          `CONFLICT: ${tag}(${x},${y}) ${dir} → ${toTag} should be (${nx},${ny}) but already placed at (${ex},${ey})`
        );
        conflicts++;
      }
    } else {
      // Check if position is already occupied by another room
      if (posToTag.has(posKey)) {
        const occupant = posToTag.get(posKey)!;
        console.error(
          `OVERLAP: ${toTag} wants (${nx},${ny}) via ${tag} ${dir}, but ${occupant} is already there`
        );
        conflicts++;
      } else {
        coords.set(toTag, [nx, ny]);
        posToTag.set(posKey, toTag);
        queue.push(toTag);
      }
    }
  }
}

// Check for rooms not reached by BFS (disconnected from central hub via cardinal dirs)
const unreached: string[] = [];
for (const tag of allTags) {
  if (!coords.has(tag)) {
    // Check if it only has up/down exits (like manholes) — skip those
    const exits = adj.get(tag);
    const hasCardinal = exits && [...exits.keys()].some(d => d in DELTAS);
    if (hasCardinal) {
      unreached.push(tag);
    }
  }
}

console.log(`\n=== Spatial Validation ===`);
console.log(`Rooms placed: ${coords.size} / ${allTags.size}`);
console.log(`Conflicts: ${conflicts}`);
if (unreached.length > 0) {
  console.log(`Unreached rooms (have cardinal exits but not connected to hub):`);
  for (const t of unreached) console.log(`  ${t}`);
}
if (conflicts === 0 && unreached.length === 0) {
  console.log(`All rooms spatially consistent!`);
}
