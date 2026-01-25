import { query } from '../index.js';
import { Action } from '@koa/shared';

// Re-export Action for convenience
export type { Action };

// Database row type for actions table
interface DbAction {
  id: number;
  command: string;
  description: string | null;
  first_person_no_target: string;
  room_no_target: string;
  first_person_with_target: string | null;
  target_perspective: string | null;
  room_with_target: string | null;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to Action interface
function dbToAction(row: DbAction): Action {
  return {
    id: row.id,
    command: row.command,
    description: row.description,
    firstPersonNoTarget: row.first_person_no_target,
    roomNoTarget: row.room_no_target,
    firstPersonWithTarget: row.first_person_with_target,
    targetPerspective: row.target_perspective,
    roomWithTarget: row.room_with_target,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// Action Read Operations
// ============================================================================

/**
 * Get an action by its ID
 */
export async function getActionById(id: number): Promise<Action | null> {
  const result = await query<DbAction>(
    'SELECT * FROM actions WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToAction(result.rows[0]) : null;
}

/**
 * Get an action by its command (case-insensitive)
 */
export async function getActionByCommand(command: string): Promise<Action | null> {
  const result = await query<DbAction>(
    'SELECT * FROM actions WHERE LOWER(command) = LOWER($1)',
    [command]
  );
  return result.rows[0] ? dbToAction(result.rows[0]) : null;
}

/**
 * Get all actions, sorted by command
 */
export async function getAllActions(): Promise<Action[]> {
  const result = await query<DbAction>(
    'SELECT * FROM actions ORDER BY command'
  );
  return result.rows.map(dbToAction);
}

// ============================================================================
// Action CRUD Operations
// ============================================================================

export interface CreateActionInput {
  command: string;
  description?: string;
  firstPersonNoTarget: string;
  roomNoTarget: string;
  firstPersonWithTarget?: string;
  targetPerspective?: string;
  roomWithTarget?: string;
}

/**
 * Create a new action
 */
export async function createAction(input: CreateActionInput): Promise<Action> {
  const result = await query<DbAction>(
    `INSERT INTO actions (
      command, description, first_person_no_target, room_no_target,
      first_person_with_target, target_perspective, room_with_target
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      input.command.toLowerCase(),
      input.description || null,
      input.firstPersonNoTarget,
      input.roomNoTarget,
      input.firstPersonWithTarget || null,
      input.targetPerspective || null,
      input.roomWithTarget || null,
    ]
  );
  return dbToAction(result.rows[0]);
}

/**
 * Update an existing action
 */
export async function updateAction(id: number, input: Partial<CreateActionInput>): Promise<Action | null> {
  const existing = await getActionById(id);
  if (!existing) return null;

  const updated = {
    command: input.command?.toLowerCase() ?? existing.command,
    description: input.description !== undefined ? input.description : existing.description,
    firstPersonNoTarget: input.firstPersonNoTarget ?? existing.firstPersonNoTarget,
    roomNoTarget: input.roomNoTarget ?? existing.roomNoTarget,
    firstPersonWithTarget: input.firstPersonWithTarget !== undefined ? input.firstPersonWithTarget : existing.firstPersonWithTarget,
    targetPerspective: input.targetPerspective !== undefined ? input.targetPerspective : existing.targetPerspective,
    roomWithTarget: input.roomWithTarget !== undefined ? input.roomWithTarget : existing.roomWithTarget,
  };

  const result = await query<DbAction>(
    `UPDATE actions SET
      command = $1, description = $2, first_person_no_target = $3, room_no_target = $4,
      first_person_with_target = $5, target_perspective = $6, room_with_target = $7,
      updated_at = NOW()
    WHERE id = $8
    RETURNING *`,
    [
      updated.command,
      updated.description || null,
      updated.firstPersonNoTarget,
      updated.roomNoTarget,
      updated.firstPersonWithTarget || null,
      updated.targetPerspective || null,
      updated.roomWithTarget || null,
      id,
    ]
  );
  return result.rows[0] ? dbToAction(result.rows[0]) : null;
}

/**
 * Delete an action by ID
 */
export async function deleteAction(id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM actions WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
