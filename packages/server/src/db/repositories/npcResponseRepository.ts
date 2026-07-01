import { query } from '../index.js';
import { parseArrayColumn } from '../arrayColumn.js';
import { NpcResponse } from '@koa/shared';

interface DbNpcResponse {
  id: number;
  npc_template_id: number;
  trigger_keywords: string[];
  response: string;
}

function dbToResponse(row: DbNpcResponse): NpcResponse {
  return {
    id: row.id,
    npcTemplateId: row.npc_template_id,
    triggerKeywords: parseArrayColumn(row.trigger_keywords),
    response: row.response,
  };
}

export async function getResponsesForTemplate(npcTemplateId: number): Promise<NpcResponse[]> {
  const result = await query<DbNpcResponse>(
    'SELECT * FROM npc_responses WHERE npc_template_id = $1 ORDER BY id',
    [npcTemplateId]
  );
  return result.rows.map(dbToResponse);
}

export async function getResponseById(id: number): Promise<NpcResponse | null> {
  const result = await query<DbNpcResponse>(
    'SELECT * FROM npc_responses WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToResponse(result.rows[0]) : null;
}

export async function getAllResponses(): Promise<NpcResponse[]> {
  const result = await query<DbNpcResponse>(
    'SELECT * FROM npc_responses ORDER BY npc_template_id, id'
  );
  return result.rows.map(dbToResponse);
}

export interface CreateResponseInput {
  npcTemplateId: number;
  triggerKeywords: string[];
  response: string;
}

export async function createResponse(input: CreateResponseInput): Promise<NpcResponse> {
  const result = await query<DbNpcResponse>(
    `INSERT INTO npc_responses (npc_template_id, trigger_keywords, response)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.npcTemplateId, input.triggerKeywords, input.response]
  );
  return dbToResponse(result.rows[0]);
}

export async function updateResponse(
  id: number,
  updates: Partial<{ triggerKeywords: string[]; response: string }>
): Promise<NpcResponse | null> {
  const existing = await getResponseById(id);
  if (!existing) return null;

  const result = await query<DbNpcResponse>(
    `UPDATE npc_responses SET
      trigger_keywords = COALESCE($1, trigger_keywords),
      response = COALESCE($2, response)
    WHERE id = $3
    RETURNING *`,
    [
      updates.triggerKeywords ?? null,
      updates.response ?? null,
      id,
    ]
  );
  return result.rows[0] ? dbToResponse(result.rows[0]) : null;
}

export async function deleteResponse(id: number): Promise<boolean> {
  const result = await query('DELETE FROM npc_responses WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllResponsesForTemplate(npcTemplateId: number): Promise<number> {
  const result = await query(
    'DELETE FROM npc_responses WHERE npc_template_id = $1',
    [npcTemplateId]
  );
  return result.rowCount ?? 0;
}

/**
 * Find a matching response for the given keywords/phrases in a message.
 * Multi-word triggers match as phrases (substring). Single-word triggers
 * match as whole words to avoid false positives.
 * Longer (more specific) triggers are checked first.
 */
export function findMatchingResponse(
  responses: NpcResponse[],
  message: string
): NpcResponse | undefined {
  const lowerMessage = message.toLowerCase().replace(/[^a-z0-9' -]/g, '');
  const words = lowerMessage.split(/\s+/);

  // Sort responses so those with longer triggers are checked first (more specific = higher priority)
  const sorted = [...responses].sort((a, b) => {
    const aMax = Math.max(...a.triggerKeywords.map(k => k.length));
    const bMax = Math.max(...b.triggerKeywords.map(k => k.length));
    return bMax - aMax;
  });

  return sorted.find(r =>
    r.triggerKeywords.some(trigger => {
      const lowerTrigger = trigger.toLowerCase().replace(/[^a-z0-9' -]/g, '');
      if (lowerTrigger.includes(' ')) {
        // Multi-word trigger: match as phrase substring
        return lowerMessage.includes(lowerTrigger);
      }
      // Single-word trigger: match as whole word
      return words.includes(lowerTrigger);
    })
  );
}
