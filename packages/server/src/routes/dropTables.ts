import { Express, Request, Response } from 'express';
import { CURRENCY_DENOMINATIONS } from '@koa/shared';
import type { CurrencyDenomination } from '@koa/shared';
import * as dropTableRepo from '../db/repositories/dropTableRepository.js';
import { requireDeveloper } from '../middleware/auth.js';

const validDenominations = new Set<string>(CURRENCY_DENOMINATIONS);

function validateDenominations(arr: unknown): string | null {
  if (!Array.isArray(arr)) return 'allowedDenominations must be an array';
  if (arr.length === 0) return 'allowedDenominations must not be empty';
  for (const d of arr) {
    if (typeof d !== 'string' || !validDenominations.has(d)) {
      return `Invalid denomination: ${d}. Valid: ${CURRENCY_DENOMINATIONS.join(', ')}`;
    }
  }
  return null;
}

/**
 * Parse a numeric field from the request body.
 * Returns the number if valid, null if undefined, or an error string.
 */
function parseNumericField(value: unknown, name: string, opts?: { min?: number; integer?: boolean }): number | null | string {
  if (value === undefined) return null;
  const n = Number(value);
  if (isNaN(n)) return `${name} must be a number`;
  if (opts?.integer && !Number.isInteger(n)) return `${name} must be an integer`;
  if (opts?.min !== undefined && n < opts.min) return `${name} must be >= ${opts.min}`;
  return n;
}

function validateEntryFields(body: Record<string, unknown>): string | null {
  const dropChance = parseNumericField(body.dropChance, 'dropChance', { min: 0 });
  if (typeof dropChance === 'string') return dropChance;
  if (typeof dropChance === 'number' && dropChance > 100) return 'dropChance must be between 0 and 100';

  const minQuantity = parseNumericField(body.minQuantity, 'minQuantity', { min: 0, integer: true });
  if (typeof minQuantity === 'string') return minQuantity;

  const maxQuantity = parseNumericField(body.maxQuantity, 'maxQuantity', { min: 0, integer: true });
  if (typeof maxQuantity === 'string') return maxQuantity;

  if (typeof minQuantity === 'number' && typeof maxQuantity === 'number' && maxQuantity < minQuantity) {
    return 'maxQuantity must be >= minQuantity';
  }

  const currencyMin = parseNumericField(body.currencyMin, 'currencyMin', { min: 0, integer: true });
  if (typeof currencyMin === 'string') return currencyMin;

  const currencyMax = parseNumericField(body.currencyMax, 'currencyMax', { min: 0, integer: true });
  if (typeof currencyMax === 'string') return currencyMax;

  if (typeof currencyMin === 'number' && typeof currencyMax === 'number' && currencyMax < currencyMin) {
    return 'currencyMax must be >= currencyMin';
  }

  if (body.allowedDenominations !== undefined) {
    const denomError = validateDenominations(body.allowedDenominations);
    if (denomError) return denomError;
  }

  return null;
}

function validateCreateEntry(body: Record<string, unknown>): string | null {
  const fieldError = validateEntryFields(body);
  if (fieldError) return fieldError;

  // Entry must have item or currency (not empty)
  const hasItem = body.itemTemplateId !== undefined && body.itemTemplateId !== null;
  const hasCurrency = (body.currencyMin !== undefined && Number(body.currencyMin) > 0) ||
                      (body.currencyMax !== undefined && Number(body.currencyMax) > 0);
  if (!hasItem && !hasCurrency) {
    return 'Entry must have either an itemTemplateId or currency (currencyMin/currencyMax > 0)';
  }

  return null;
}

export function setupDropTableRoutes(app: Express): void {
  // ============================================================================
  // DROP TABLE CRUD
  // ============================================================================

  // List all drop tables
  app.get('/api/drop-tables', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const tables = await dropTableRepo.getAllDropTables();
      res.json({ success: true, dropTables: tables });
    } catch (error) {
      console.error('Failed to get drop tables:', error);
      res.status(500).json({ success: false, message: 'Failed to get drop tables' });
    }
  });

  // Get single drop table with entries
  app.get('/api/drop-tables/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid drop table ID' });
        return;
      }

      const table = await dropTableRepo.getDropTableWithEntries(id);
      if (!table) {
        res.status(404).json({ success: false, message: 'Drop table not found' });
        return;
      }

      res.json({ success: true, dropTable: table });
    } catch (error) {
      console.error('Failed to get drop table:', error);
      res.status(500).json({ success: false, message: 'Failed to get drop table' });
    }
  });

  // Create drop table
  app.post('/api/drop-tables', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, message: 'name is required and must be a string' });
        return;
      }

      const table = await dropTableRepo.createDropTable({ name, description });
      res.json({ success: true, dropTable: table });
    } catch (error) {
      console.error('Failed to create drop table:', error);
      res.status(500).json({ success: false, message: 'Failed to create drop table' });
    }
  });

  // Update drop table
  app.put('/api/drop-tables/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid drop table ID' });
        return;
      }

      const table = await dropTableRepo.updateDropTable(id, req.body);
      if (!table) {
        res.status(404).json({ success: false, message: 'Drop table not found' });
        return;
      }

      res.json({ success: true, dropTable: table });
    } catch (error) {
      console.error('Failed to update drop table:', error);
      res.status(500).json({ success: false, message: 'Failed to update drop table' });
    }
  });

  // Delete drop table (cascades entries)
  app.delete('/api/drop-tables/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid drop table ID' });
        return;
      }

      const success = await dropTableRepo.deleteDropTable(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Drop table not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete drop table:', error);
      res.status(500).json({ success: false, message: 'Failed to delete drop table' });
    }
  });

  // ============================================================================
  // ENTRY CRUD
  // ============================================================================

  // Add entry to drop table
  app.post('/api/drop-tables/:tableId/entries', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const tableId = parseInt(req.params.tableId);
      if (isNaN(tableId)) {
        res.status(400).json({ success: false, message: 'Invalid drop table ID' });
        return;
      }

      // Verify table exists
      const table = await dropTableRepo.getDropTableById(tableId);
      if (!table) {
        res.status(404).json({ success: false, message: 'Drop table not found' });
        return;
      }

      const { dropChance, itemTemplateId, minQuantity, maxQuantity, currencyMin, currencyMax, allowedDenominations } = req.body;

      if (dropChance === undefined || dropChance === null) {
        res.status(400).json({ success: false, message: 'dropChance is required' });
        return;
      }

      const validationError = validateCreateEntry(req.body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      const entry = await dropTableRepo.createEntry({
        dropTableId: tableId,
        itemTemplateId: itemTemplateId || null,
        dropChance: Number(dropChance),
        minQuantity: minQuantity !== undefined ? Number(minQuantity) : 1,
        maxQuantity: maxQuantity !== undefined ? Number(maxQuantity) : 1,
        currencyMin: currencyMin !== undefined ? Number(currencyMin) : 0,
        currencyMax: currencyMax !== undefined ? Number(currencyMax) : 0,
        allowedDenominations: allowedDenominations as CurrencyDenomination[] | undefined,
      });

      res.json({ success: true, entry });
    } catch (error) {
      console.error('Failed to create drop table entry:', error);
      res.status(500).json({ success: false, message: 'Failed to create entry' });
    }
  });

  // Update entry (scoped to tableId)
  app.put('/api/drop-tables/:tableId/entries/:entryId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const tableId = parseInt(req.params.tableId);
      const entryId = parseInt(req.params.entryId);
      if (isNaN(tableId) || isNaN(entryId)) {
        res.status(400).json({ success: false, message: 'Invalid ID' });
        return;
      }

      const validationError = validateEntryFields(req.body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      const entry = await dropTableRepo.updateEntry(tableId, entryId, {
        itemTemplateId: req.body.itemTemplateId,
        dropChance: req.body.dropChance !== undefined ? Number(req.body.dropChance) : undefined,
        minQuantity: req.body.minQuantity !== undefined ? Number(req.body.minQuantity) : undefined,
        maxQuantity: req.body.maxQuantity !== undefined ? Number(req.body.maxQuantity) : undefined,
        currencyMin: req.body.currencyMin !== undefined ? Number(req.body.currencyMin) : undefined,
        currencyMax: req.body.currencyMax !== undefined ? Number(req.body.currencyMax) : undefined,
        allowedDenominations: req.body.allowedDenominations as CurrencyDenomination[] | undefined,
      });

      if (!entry) {
        res.status(404).json({ success: false, message: 'Entry not found in this drop table' });
        return;
      }

      res.json({ success: true, entry });
    } catch (error) {
      console.error('Failed to update drop table entry:', error);
      res.status(500).json({ success: false, message: 'Failed to update entry' });
    }
  });

  // Delete entry (scoped to tableId)
  app.delete('/api/drop-tables/:tableId/entries/:entryId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const tableId = parseInt(req.params.tableId);
      const entryId = parseInt(req.params.entryId);
      if (isNaN(tableId) || isNaN(entryId)) {
        res.status(400).json({ success: false, message: 'Invalid ID' });
        return;
      }

      const success = await dropTableRepo.deleteEntry(tableId, entryId);
      if (!success) {
        res.status(404).json({ success: false, message: 'Entry not found in this drop table' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete drop table entry:', error);
      res.status(500).json({ success: false, message: 'Failed to delete entry' });
    }
  });
}
