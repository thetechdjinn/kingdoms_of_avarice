import { query } from '../index.js';
import { MerchantResponse } from '@koa/shared';

interface DbMerchantResponse {
  id: number;
  npc_template_id: number;
  trigger_keywords: string[];
  response: string;
}

function dbToResponse(row: DbMerchantResponse): MerchantResponse {
  return {
    id: row.id,
    npcTemplateId: row.npc_template_id,
    triggerKeywords: row.trigger_keywords,
    response: row.response,
  };
}

export async function getResponsesForTemplate(npcTemplateId: number): Promise<MerchantResponse[]> {
  const result = await query<DbMerchantResponse>(
    'SELECT * FROM merchant_responses WHERE npc_template_id = $1 ORDER BY id',
    [npcTemplateId]
  );
  return result.rows.map(dbToResponse);
}

export async function getResponseById(id: number): Promise<MerchantResponse | null> {
  const result = await query<DbMerchantResponse>(
    'SELECT * FROM merchant_responses WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToResponse(result.rows[0]) : null;
}

export async function getAllResponses(): Promise<MerchantResponse[]> {
  const result = await query<DbMerchantResponse>(
    'SELECT * FROM merchant_responses ORDER BY npc_template_id, id'
  );
  return result.rows.map(dbToResponse);
}

export interface CreateResponseInput {
  npcTemplateId: number;
  triggerKeywords: string[];
  response: string;
}

export async function createResponse(input: CreateResponseInput): Promise<MerchantResponse> {
  const result = await query<DbMerchantResponse>(
    `INSERT INTO merchant_responses (npc_template_id, trigger_keywords, response)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.npcTemplateId, input.triggerKeywords, input.response]
  );
  return dbToResponse(result.rows[0]);
}

export async function updateResponse(
  id: number,
  updates: Partial<{ triggerKeywords: string[]; response: string }>
): Promise<MerchantResponse | null> {
  const existing = await getResponseById(id);
  if (!existing) return null;

  const result = await query<DbMerchantResponse>(
    `UPDATE merchant_responses SET
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
  const result = await query('DELETE FROM merchant_responses WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllResponsesForTemplate(npcTemplateId: number): Promise<number> {
  const result = await query(
    'DELETE FROM merchant_responses WHERE npc_template_id = $1',
    [npcTemplateId]
  );
  return result.rowCount ?? 0;
}

/**
 * Find a matching response for the given keywords in a message.
 * Checks if any word in the message matches any trigger keyword (case-insensitive).
 */
export function findMatchingResponse(
  responses: MerchantResponse[],
  message: string
): MerchantResponse | undefined {
  const words = message.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, ''));
  return responses.find(r =>
    r.triggerKeywords.some(keyword =>
      words.includes(keyword.toLowerCase())
    )
  );
}
