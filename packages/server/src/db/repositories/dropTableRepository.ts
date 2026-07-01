import { query } from '../index.js';
import { parseArrayColumn } from '../arrayColumn.js';
import type { DropTable, DropTableEntry, CurrencyDenomination } from '@koa/shared';
import { CURRENCY_DENOMINATIONS } from '@koa/shared';

// Re-export for convenience
export type { DropTable, DropTableEntry };

// ============================================================================
// Database Row Types
// ============================================================================

interface DbDropTable {
  id: number;
  name: string;
  description: string | null;
}

interface DbDropTableEntry {
  id: number;
  drop_table_id: number;
  item_template_id: number | null;
  drop_chance: number;
  min_quantity: number;
  max_quantity: number;
  currency_min: number;
  currency_max: number;
  allowed_denominations: string[] | null;
}

// ============================================================================
// Row Converters
// ============================================================================

function dbToDropTable(row: DbDropTable): DropTable {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
  };
}

function dbToEntry(row: DbDropTableEntry): DropTableEntry {
  return {
    id: row.id,
    dropTableId: row.drop_table_id,
    itemTemplateId: row.item_template_id,
    dropChance: Number(row.drop_chance),
    minQuantity: row.min_quantity,
    maxQuantity: row.max_quantity,
    currencyMin: row.currency_min,
    currencyMax: row.currency_max,
    allowedDenominations: (() => {
      const parsed = parseArrayColumn<CurrencyDenomination>(row.allowed_denominations);
      return parsed.length > 0 ? parsed : [...CURRENCY_DENOMINATIONS];
    })(),
  };
}

// ============================================================================
// Drop Table CRUD
// ============================================================================

export async function getAllDropTables(): Promise<DropTable[]> {
  const result = await query<DbDropTable>('SELECT * FROM drop_tables ORDER BY id');
  return result.rows.map(dbToDropTable);
}

export async function getDropTableById(id: number): Promise<DropTable | null> {
  const result = await query<DbDropTable>(
    'SELECT * FROM drop_tables WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToDropTable(result.rows[0]) : null;
}

export async function getDropTableByName(name: string): Promise<DropTable | null> {
  const result = await query<DbDropTable>(
    'SELECT * FROM drop_tables WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToDropTable(result.rows[0]) : null;
}

export interface CreateDropTableInput {
  name: string;
  description?: string;
}

export async function createDropTable(input: CreateDropTableInput): Promise<DropTable> {
  const result = await query<DbDropTable>(
    `INSERT INTO drop_tables (name, description)
     VALUES ($1, $2) RETURNING *`,
    [input.name, input.description || null]
  );
  return dbToDropTable(result.rows[0]);
}

export async function updateDropTable(id: number, input: Partial<CreateDropTableInput>): Promise<DropTable | null> {
  const existing = await getDropTableById(id);
  if (!existing) return null;

  const updated = {
    name: input.name ?? existing.name,
    description: input.description !== undefined ? input.description : existing.description,
  };

  const result = await query<DbDropTable>(
    `UPDATE drop_tables SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
    [updated.name, updated.description || null, id]
  );
  return result.rows[0] ? dbToDropTable(result.rows[0]) : null;
}

export async function deleteDropTable(id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM drop_tables WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Entry CRUD
// ============================================================================

export async function getEntriesForDropTable(dropTableId: number): Promise<DropTableEntry[]> {
  const result = await query<DbDropTableEntry>(
    'SELECT * FROM drop_table_entries WHERE drop_table_id = $1 ORDER BY id',
    [dropTableId]
  );
  return result.rows.map(dbToEntry);
}

export interface CreateEntryInput {
  dropTableId: number;
  itemTemplateId?: number | null;
  dropChance: number;
  minQuantity?: number;
  maxQuantity?: number;
  currencyMin?: number;
  currencyMax?: number;
  allowedDenominations?: CurrencyDenomination[];
}

export async function createEntry(input: CreateEntryInput): Promise<DropTableEntry> {
  const denominations = input.allowedDenominations || [...CURRENCY_DENOMINATIONS];
  const result = await query<DbDropTableEntry>(
    `INSERT INTO drop_table_entries (
      drop_table_id, item_template_id, drop_chance,
      min_quantity, max_quantity, currency_min, currency_max,
      allowed_denominations
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.dropTableId,
      input.itemTemplateId || null,
      input.dropChance,
      input.minQuantity ?? 1,
      input.maxQuantity ?? 1,
      input.currencyMin ?? 0,
      input.currencyMax ?? 0,
      denominations,
    ]
  );
  return dbToEntry(result.rows[0]);
}

export async function updateEntry(
  dropTableId: number,
  entryId: number,
  input: Partial<Omit<CreateEntryInput, 'dropTableId'>>
): Promise<DropTableEntry | null> {
  const existingResult = await query<DbDropTableEntry>(
    'SELECT * FROM drop_table_entries WHERE id = $1 AND drop_table_id = $2',
    [entryId, dropTableId]
  );
  if (existingResult.rows.length === 0) return null;

  const existing = dbToEntry(existingResult.rows[0]);

  const updated = {
    itemTemplateId: input.itemTemplateId !== undefined ? input.itemTemplateId : existing.itemTemplateId,
    dropChance: input.dropChance ?? existing.dropChance,
    minQuantity: input.minQuantity ?? existing.minQuantity,
    maxQuantity: input.maxQuantity ?? existing.maxQuantity,
    currencyMin: input.currencyMin ?? existing.currencyMin,
    currencyMax: input.currencyMax ?? existing.currencyMax,
    allowedDenominations: input.allowedDenominations ?? existing.allowedDenominations,
  };

  const result = await query<DbDropTableEntry>(
    `UPDATE drop_table_entries SET
      item_template_id = $1, drop_chance = $2,
      min_quantity = $3, max_quantity = $4,
      currency_min = $5, currency_max = $6,
      allowed_denominations = $7
    WHERE id = $8 AND drop_table_id = $9 RETURNING *`,
    [
      updated.itemTemplateId || null,
      updated.dropChance,
      updated.minQuantity,
      updated.maxQuantity,
      updated.currencyMin,
      updated.currencyMax,
      updated.allowedDenominations,
      entryId,
      dropTableId,
    ]
  );
  return result.rows[0] ? dbToEntry(result.rows[0]) : null;
}

export async function deleteEntry(dropTableId: number, entryId: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM drop_table_entries WHERE id = $1 AND drop_table_id = $2',
    [entryId, dropTableId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Combo Loader
// ============================================================================

export async function getDropTableWithEntries(id: number): Promise<(DropTable & { entries: DropTableEntry[] }) | null> {
  const table = await getDropTableById(id);
  if (!table) return null;

  const entries = await getEntriesForDropTable(id);
  return { ...table, entries };
}
