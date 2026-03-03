/**
 * Generates the 17x17 street grid for Arindale.
 * 5x5 intersections with 3 rooms between each = 25 + 60 + 60 = 145 rooms.
 */
import { RoomDef, ExitDef } from './types.js';
import {
  ewStreetName, nsStreetName,
  intersectionName, intersectionDescription,
  ewStreetDescription, nsStreetDescription,
  maybeAddDetail,
} from './descriptions.js';

const ROWS = 5;  // E/W streets (0=Harbor Road .. 4=Southwall Road)
const COLS = 5;  // N/S streets (0=Westwall St .. 4=Eastwall St)
const MID = 3;   // rooms between intersections

// Tag helpers
export function intTag(row: number, col: number): string {
  return `int_${row}_${col}`;
}

function ewTag(row: number, seg: number, pos: number): string {
  return `ew_${row}_${seg}_${pos}`;
}

function nsTag(col: number, seg: number, pos: number): string {
  return `ns_${col}_${seg}_${pos}`;
}

// Opposite directions
const OPPOSITE: Record<string, string> = {
  north: 'south', south: 'north',
  east: 'west', west: 'east',
  up: 'down', down: 'up',
};

export function generateGrid(): { rooms: RoomDef[]; exits: ExitDef[] } {
  const rooms: RoomDef[] = [];
  const exits: ExitDef[] = [];

  // ── Intersections ──────────────────────────────────────────────────

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tag = intTag(r, c);
      rooms.push({
        tag,
        name: intersectionName(r, c),
        description: intersectionDescription(r, c, tag),
        terrain: 'road',
      });
    }
  }

  // ── E/W mid-street rooms ───────────────────────────────────────────

  for (let r = 0; r < ROWS; r++) {
    for (let seg = 0; seg < COLS - 1; seg++) {
      for (let pos = 1; pos <= MID; pos++) {
        const tag = ewTag(r, seg, pos);
        const desc = maybeAddDetail(ewStreetDescription(r, tag), tag);
        rooms.push({
          tag,
          name: ewStreetName(r),
          description: desc,
          terrain: 'road',
        });
      }
    }
  }

  // ── N/S mid-street rooms ───────────────────────────────────────────

  for (let c = 0; c < COLS; c++) {
    for (let seg = 0; seg < ROWS - 1; seg++) {
      for (let pos = 1; pos <= MID; pos++) {
        const tag = nsTag(c, seg, pos);
        const desc = maybeAddDetail(nsStreetDescription(c, tag), tag);
        rooms.push({
          tag,
          name: nsStreetName(c),
          description: desc,
          terrain: 'road',
        });
      }
    }
  }

  // ── Wire E/W segments ──────────────────────────────────────────────
  // Each segment: intersection[r][seg] ─east─ ew_1 ─east─ ew_2 ─east─ ew_3 ─east─ intersection[r][seg+1]

  for (let r = 0; r < ROWS; r++) {
    for (let seg = 0; seg < COLS - 1; seg++) {
      const westInt = intTag(r, seg);
      const eastInt = intTag(r, seg + 1);

      // West intersection → first mid room
      const first = ewTag(r, seg, 1);
      exits.push({ fromTag: westInt, toTag: first, direction: 'east' });
      exits.push({ fromTag: first, toTag: westInt, direction: 'west' });

      // Mid rooms chained
      for (let pos = 1; pos < MID; pos++) {
        const a = ewTag(r, seg, pos);
        const b = ewTag(r, seg, pos + 1);
        exits.push({ fromTag: a, toTag: b, direction: 'east' });
        exits.push({ fromTag: b, toTag: a, direction: 'west' });
      }

      // Last mid room → east intersection
      const last = ewTag(r, seg, MID);
      exits.push({ fromTag: last, toTag: eastInt, direction: 'east' });
      exits.push({ fromTag: eastInt, toTag: last, direction: 'west' });
    }
  }

  // ── Wire N/S segments ──────────────────────────────────────────────
  // Each segment: intersection[seg][c] ─south─ ns_1 ─south─ ns_2 ─south─ ns_3 ─south─ intersection[seg+1][c]

  for (let c = 0; c < COLS; c++) {
    for (let seg = 0; seg < ROWS - 1; seg++) {
      const northInt = intTag(seg, c);
      const southInt = intTag(seg + 1, c);

      const first = nsTag(c, seg, 1);
      exits.push({ fromTag: northInt, toTag: first, direction: 'south' });
      exits.push({ fromTag: first, toTag: northInt, direction: 'north' });

      for (let pos = 1; pos < MID; pos++) {
        const a = nsTag(c, seg, pos);
        const b = nsTag(c, seg, pos + 1);
        exits.push({ fromTag: a, toTag: b, direction: 'south' });
        exits.push({ fromTag: b, toTag: a, direction: 'north' });
      }

      const last = nsTag(c, seg, MID);
      exits.push({ fromTag: last, toTag: southInt, direction: 'south' });
      exits.push({ fromTag: southInt, toTag: last, direction: 'north' });
    }
  }

  return { rooms, exits };
}
