import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import * as npcResponseRepo from '../db/repositories/npcResponseRepository.js';
import { clearNpcResponseCache } from '../game/npcManager.js';
import { requireDeveloper } from '../middleware/auth.js';

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10);
  return n > 0 ? n : NaN;
}

export function setupNpcResponseRoutes(app: Express): void {
  // Get responses for an NPC template
  app.get('/api/npcs/:npcTemplateId/responses', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const npcTemplateId = parsePositiveInt(req.params.npcTemplateId);
      if (isNaN(npcTemplateId)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }
      const responses = await npcResponseRepo.getResponsesForTemplate(npcTemplateId);
      res.json({ success: true, responses });
    } catch (error) {
      console.error('Failed to get NPC responses:', error);
      res.status(500).json({ success: false, message: 'Failed to get NPC responses' });
    }
  });

  // Add response
  app.post('/api/npcs/:npcTemplateId/responses', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const npcTemplateId = parsePositiveInt(req.params.npcTemplateId);
      if (isNaN(npcTemplateId)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }
      const { triggerKeywords, response: responseText } = req.body;
      if (!Array.isArray(triggerKeywords) || triggerKeywords.length === 0 ||
          !triggerKeywords.every((k: unknown) => typeof k === 'string' && k.trim().length > 0)) {
        res.status(400).json({ success: false, message: 'triggerKeywords must be a non-empty array of non-empty strings' });
        return;
      }
      if (!responseText || typeof responseText !== 'string' || responseText.trim().length === 0) {
        res.status(400).json({ success: false, message: 'response text is required' });
        return;
      }
      const entry = await npcResponseRepo.createResponse({
        npcTemplateId,
        triggerKeywords,
        response: responseText,
      });
      clearNpcResponseCache();
      res.json({ success: true, response: entry });
    } catch (error) {
      console.error('Failed to create NPC response:', error);
      res.status(500).json({ success: false, message: 'Failed to create response' });
    }
  });

  // Update response
  app.put('/api/npc-responses/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid response ID' });
        return;
      }
      const { triggerKeywords, response: responseText } = req.body;
      if (triggerKeywords !== undefined &&
          (!Array.isArray(triggerKeywords) || triggerKeywords.length === 0 ||
           !triggerKeywords.every((k: unknown) => typeof k === 'string' && k.trim().length > 0))) {
        res.status(400).json({ success: false, message: 'triggerKeywords must be a non-empty array of non-empty strings' });
        return;
      }
      if (responseText !== undefined && (typeof responseText !== 'string' || responseText.trim().length === 0)) {
        res.status(400).json({ success: false, message: 'response must be a non-empty string' });
        return;
      }
      const entry = await npcResponseRepo.updateResponse(id, {
        triggerKeywords,
        response: responseText,
      });
      if (!entry) {
        res.status(404).json({ success: false, message: 'Response not found' });
        return;
      }
      clearNpcResponseCache();
      res.json({ success: true, response: entry });
    } catch (error) {
      console.error('Failed to update NPC response:', error);
      res.status(500).json({ success: false, message: 'Failed to update response' });
    }
  });

  // Delete response
  app.delete('/api/npc-responses/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid response ID' });
        return;
      }
      const deleted = await npcResponseRepo.deleteResponse(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Response not found' });
        return;
      }
      clearNpcResponseCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete NPC response:', error);
      res.status(500).json({ success: false, message: 'Failed to delete response' });
    }
  });
}
