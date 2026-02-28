import { Express, Request, Response } from 'express';
import * as merchantRepo from '../db/repositories/merchantRepository.js';
import * as merchantResponseRepo from '../db/repositories/merchantResponseRepository.js';
import { calculateMerchantPrice } from '../game/merchantCommands.js';
import { clearMerchantResponseCache } from '../game/npcManager.js';
import { requireDeveloper } from '../middleware/auth.js';

function parsePositiveInt(value: string): number {
  const n = parseInt(value);
  return (!isNaN(n) && n > 0) ? n : NaN;
}

export function setupMerchantRoutes(app: Express): void {
  // ========================================================================
  // Merchant Inventory CRUD
  // ========================================================================

  // Get inventory for a merchant template
  app.get('/api/merchants/:npcTemplateId/inventory', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const npcTemplateId = parsePositiveInt(req.params.npcTemplateId);
      if (isNaN(npcTemplateId)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }
      const inventory = await merchantRepo.getInventoryWithTemplates(npcTemplateId);
      res.json({ success: true, inventory });
    } catch (error) {
      console.error('Failed to get merchant inventory:', error);
      res.status(500).json({ success: false, message: 'Failed to get merchant inventory' });
    }
  });

  // Add item to merchant inventory
  app.post('/api/merchants/:npcTemplateId/inventory', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const npcTemplateId = parsePositiveInt(req.params.npcTemplateId);
      if (isNaN(npcTemplateId)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }
      const { itemTemplateId, maxStock, currentStock, restockChance } = req.body;
      if (!itemTemplateId || typeof itemTemplateId !== 'number' || !Number.isInteger(itemTemplateId) || itemTemplateId < 1) {
        res.status(400).json({ success: false, message: 'itemTemplateId must be a positive integer' });
        return;
      }
      if (maxStock !== undefined && (typeof maxStock !== 'number' || !Number.isInteger(maxStock) || maxStock < 0)) {
        res.status(400).json({ success: false, message: 'maxStock must be a non-negative integer' });
        return;
      }
      if (currentStock !== undefined && (typeof currentStock !== 'number' || !Number.isInteger(currentStock) || currentStock < 0)) {
        res.status(400).json({ success: false, message: 'currentStock must be a non-negative integer' });
        return;
      }
      if (restockChance !== undefined && (typeof restockChance !== 'number' || !Number.isInteger(restockChance) || restockChance < 1 || restockChance > 100)) {
        res.status(400).json({ success: false, message: 'restockChance must be an integer between 1 and 100' });
        return;
      }
      const effectiveMaxStock = maxStock ?? 10;
      const effectiveCurrentStock = currentStock ?? effectiveMaxStock;
      if (effectiveCurrentStock > effectiveMaxStock) {
        res.status(400).json({ success: false, message: 'currentStock cannot exceed maxStock' });
        return;
      }
      const entry = await merchantRepo.createInventoryEntry({
        npcTemplateId,
        itemTemplateId,
        maxStock: effectiveMaxStock,
        currentStock: effectiveCurrentStock,
        restockChance: restockChance ?? 100,
      });
      res.json({ success: true, entry });
    } catch (error) {
      console.error('Failed to add merchant inventory entry:', error);
      res.status(500).json({ success: false, message: 'Failed to add inventory entry' });
    }
  });

  // Update merchant inventory entry
  app.put('/api/merchants/inventory/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid inventory entry ID' });
        return;
      }
      const { maxStock, currentStock, restockChance } = req.body;
      if (maxStock !== undefined && (typeof maxStock !== 'number' || !Number.isInteger(maxStock) || maxStock < 0)) {
        res.status(400).json({ success: false, message: 'maxStock must be a non-negative integer' });
        return;
      }
      if (currentStock !== undefined && (typeof currentStock !== 'number' || !Number.isInteger(currentStock) || currentStock < 0)) {
        res.status(400).json({ success: false, message: 'currentStock must be a non-negative integer' });
        return;
      }
      if (restockChance !== undefined && (typeof restockChance !== 'number' || !Number.isInteger(restockChance) || restockChance < 1 || restockChance > 100)) {
        res.status(400).json({ success: false, message: 'restockChance must be an integer between 1 and 100' });
        return;
      }
      if (maxStock !== undefined && currentStock !== undefined && currentStock > maxStock) {
        res.status(400).json({ success: false, message: 'currentStock cannot exceed maxStock' });
        return;
      }
      // When only maxStock is lowered, ensure existing current_stock doesn't exceed it
      if (maxStock !== undefined && currentStock === undefined) {
        const existing = await merchantRepo.getInventoryEntry(id);
        if (existing && existing.currentStock > maxStock) {
          res.status(400).json({ success: false, message: `currentStock (${existing.currentStock}) would exceed new maxStock (${maxStock}). Lower currentStock first or send both values.` });
          return;
        }
      }
      const entry = await merchantRepo.updateInventoryEntry(id, {
        maxStock, currentStock, restockChance,
      });
      if (!entry) {
        res.status(404).json({ success: false, message: 'Inventory entry not found' });
        return;
      }
      res.json({ success: true, entry });
    } catch (error) {
      console.error('Failed to update merchant inventory entry:', error);
      res.status(500).json({ success: false, message: 'Failed to update inventory entry' });
    }
  });

  // Delete merchant inventory entry
  app.delete('/api/merchants/inventory/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid inventory entry ID' });
        return;
      }
      const deleted = await merchantRepo.deleteInventoryEntry(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Inventory entry not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete merchant inventory entry:', error);
      res.status(500).json({ success: false, message: 'Failed to delete inventory entry' });
    }
  });

  // ========================================================================
  // Price Testing
  // ========================================================================

  // Test price calculation
  app.post('/api/merchants/test-price', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { baseValue, factionRep, charisma, haggleRep } = req.body;
      if (typeof baseValue !== 'number' || baseValue < 0) {
        res.status(400).json({ success: false, message: 'baseValue must be >= 0' });
        return;
      }
      const buyResult = calculateMerchantPrice(baseValue, factionRep ?? 0, charisma ?? 50, true, haggleRep ?? 0);
      const sellResult = calculateMerchantPrice(baseValue, factionRep ?? 0, charisma ?? 50, false, haggleRep ?? 0);
      res.json({ success: true, buy: buyResult, sell: sellResult });
    } catch (error) {
      console.error('Failed to calculate test price:', error);
      res.status(500).json({ success: false, message: 'Failed to calculate price' });
    }
  });

  // ========================================================================
  // Merchant Responses CRUD
  // ========================================================================

  // Get responses for a merchant template
  app.get('/api/merchants/:npcTemplateId/responses', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const npcTemplateId = parsePositiveInt(req.params.npcTemplateId);
      if (isNaN(npcTemplateId)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }
      const responses = await merchantResponseRepo.getResponsesForTemplate(npcTemplateId);
      res.json({ success: true, responses });
    } catch (error) {
      console.error('Failed to get merchant responses:', error);
      res.status(500).json({ success: false, message: 'Failed to get merchant responses' });
    }
  });

  // Add response
  app.post('/api/merchants/:npcTemplateId/responses', requireDeveloper, async (req: Request, res: Response) => {
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
      const entry = await merchantResponseRepo.createResponse({
        npcTemplateId,
        triggerKeywords,
        response: responseText,
      });
      clearMerchantResponseCache();
      res.json({ success: true, response: entry });
    } catch (error) {
      console.error('Failed to create merchant response:', error);
      res.status(500).json({ success: false, message: 'Failed to create response' });
    }
  });

  // Update response
  app.put('/api/merchants/responses/:id', requireDeveloper, async (req: Request, res: Response) => {
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
      const entry = await merchantResponseRepo.updateResponse(id, {
        triggerKeywords,
        response: responseText,
      });
      if (!entry) {
        res.status(404).json({ success: false, message: 'Response not found' });
        return;
      }
      clearMerchantResponseCache();
      res.json({ success: true, response: entry });
    } catch (error) {
      console.error('Failed to update merchant response:', error);
      res.status(500).json({ success: false, message: 'Failed to update response' });
    }
  });

  // Delete response
  app.delete('/api/merchants/responses/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid response ID' });
        return;
      }
      const deleted = await merchantResponseRepo.deleteResponse(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Response not found' });
        return;
      }
      clearMerchantResponseCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete merchant response:', error);
      res.status(500).json({ success: false, message: 'Failed to delete response' });
    }
  });
}
