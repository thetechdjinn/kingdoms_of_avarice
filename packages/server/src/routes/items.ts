import { Express, Request, Response } from 'express';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as craftingRepo from '../db/repositories/craftingRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { ItemType, ItemLocationType, ItemCondition, EquipmentSlot, ItemRarity } from '@koa/shared';
import { withTransaction } from '../db/index.js';

export function setupItemRoutes(app: Express): void {
  // ============================================================================
  // ITEM TEMPLATES
  // ============================================================================

  // Get all item templates (optionally filtered by type)
  app.get('/api/items/templates', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const typeFilter = typeof req.query.type === 'string' ? req.query.type : undefined;
      let templates;

      if (typeFilter) {
        if (!Object.values(ItemType).includes(typeFilter as ItemType)) {
          res.status(400).json({ success: false, message: 'Invalid item type' });
          return;
        }
        templates = await itemRepo.getTemplatesByType(typeFilter as ItemType);
      } else {
        templates = await itemRepo.getAllTemplates();
      }

      res.json({ success: true, templates });
    } catch (error) {
      console.error('Failed to get item templates:', error);
      res.status(500).json({ success: false, message: 'Failed to get item templates' });
    }
  });

  // Get single item template
  app.get('/api/items/templates/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid template ID' });
        return;
      }

      const template = await itemRepo.getTemplateById(id);
      if (!template) {
        res.status(404).json({ success: false, message: 'Template not found' });
        return;
      }

      res.json({ success: true, template });
    } catch (error) {
      console.error('Failed to get item template:', error);
      res.status(500).json({ success: false, message: 'Failed to get item template' });
    }
  });

  // Create item template
  app.post('/api/items/templates', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const {
        name, short_desc, long_desc, room_desc, keywords,
        weight, size, base_value, item_type, equipment_slot,
        flags, max_stack, container_capacity, container_weight_limit,
        weapon_data, armor_data, consumable_data, light_data,
        requirements, stat_modifiers, effect_slots, base_effects,
        rarity, max_in_world
      } = req.body;

      if (!name || !short_desc || !item_type) {
        res.status(400).json({ success: false, message: 'Name, short_desc, and item_type are required' });
        return;
      }

      // Validate item_type is a valid enum value
      const validItemTypes = Object.values(ItemType);
      if (!validItemTypes.includes(item_type)) {
        res.status(400).json({ success: false, message: `Invalid item_type: must be one of ${validItemTypes.join(', ')}` });
        return;
      }

      // Validate equipment_slot if provided
      if (equipment_slot) {
        const validSlots = Object.values(EquipmentSlot);
        if (!validSlots.includes(equipment_slot)) {
          res.status(400).json({ success: false, message: `Invalid equipment_slot: must be one of ${validSlots.join(', ')}` });
          return;
        }
      }

      // Validate rarity if provided
      if (rarity !== undefined) {
        const validRarities = Object.values(ItemRarity);
        if (!validRarities.includes(rarity)) {
          res.status(400).json({ success: false, message: `Invalid rarity: must be one of ${validRarities.join(', ')}` });
          return;
        }
      }

      // Validate max_in_world if provided
      if (max_in_world !== undefined && (typeof max_in_world !== 'number' || !Number.isInteger(max_in_world) || max_in_world < 1)) {
        res.status(400).json({ success: false, message: 'max_in_world must be a positive integer' });
        return;
      }

      const template = await itemRepo.createTemplate({
        name,
        short_desc,
        long_desc,
        room_desc,
        keywords: keywords || [name.toLowerCase()],
        weight: weight ?? 0,
        size: size ?? 1,
        base_value: base_value ?? 0,
        item_type,
        equipment_slot,
        flags: flags ?? {},
        max_stack: max_stack ?? 1,
        container_capacity,
        container_weight_limit,
        weapon_data,
        armor_data,
        consumable_data,
        light_data,
        requirements,
        stat_modifiers,
        effect_slots: effect_slots ?? 0,
        base_effects,
        rarity,
        max_in_world,
      });

      res.json({ success: true, template });
    } catch (error) {
      console.error('Failed to create item template:', error);
      res.status(500).json({ success: false, message: 'Failed to create item template' });
    }
  });

  // Update item template
  app.put('/api/items/templates/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid template ID' });
        return;
      }

      const existing = await itemRepo.getTemplateById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Template not found' });
        return;
      }

      const template = await itemRepo.updateTemplate(id, req.body);
      res.json({ success: true, template });
    } catch (error) {
      console.error('Failed to update item template:', error);
      res.status(500).json({ success: false, message: 'Failed to update item template' });
    }
  });

  // Delete item template
  app.delete('/api/items/templates/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid template ID' });
        return;
      }

      const success = await itemRepo.deleteTemplate(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Template not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete item template:', error);
      res.status(500).json({ success: false, message: 'Failed to delete item template' });
    }
  });

  // ============================================================================
  // ITEM INSTANCES
  // ============================================================================

  // Get all item instances (with optional filters)
  app.get('/api/items/instances', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { location_type, location_id } = req.query;
      
      let instances;
      if (location_type === 'room' && location_id) {
        const roomId = parseInt(location_id as string);
        if (isNaN(roomId)) {
          res.status(400).json({ success: false, message: 'Invalid room ID' });
          return;
        }
        instances = await itemRepo.getInstancesInRoom(roomId);
      } else if (location_type === 'player' && location_id) {
        const playerId = parseInt(location_id as string);
        if (isNaN(playerId)) {
          res.status(400).json({ success: false, message: 'Invalid player ID' });
          return;
        }
        instances = await itemRepo.getPlayerInventory(playerId);
      } else {
        // Get all instances
        instances = await itemRepo.getAllInstances();
      }

      res.json({ success: true, instances });
    } catch (error) {
      console.error('Failed to get item instances:', error);
      res.status(500).json({ success: false, message: 'Failed to get item instances' });
    }
  });

  // Get single item instance
  app.get('/api/items/instances/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid instance ID' });
        return;
      }

      const instance = await itemRepo.getInstanceById(id);
      if (!instance) {
        res.status(404).json({ success: false, message: 'Instance not found' });
        return;
      }

      res.json({ success: true, instance });
    } catch (error) {
      console.error('Failed to get item instance:', error);
      res.status(500).json({ success: false, message: 'Failed to get item instance' });
    }
  });

  // Create item instance
  app.post('/api/items/instances', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const {
        template_id, location_type, location_id,
        equipped_slot, quantity, condition,
        charges_remaining, fuel_remaining, custom_data
      } = req.body;

      if (!template_id || !location_type || location_id === undefined || location_id === null) {
        res.status(400).json({ success: false, message: 'template_id, location_type, and location_id are required' });
        return;
      }
      
      // Validate template_id is a positive integer
      const templateIdNum = typeof template_id === 'number' ? template_id : parseInt(String(template_id), 10);
      if (isNaN(templateIdNum) || templateIdNum < 1) {
        res.status(400).json({ success: false, message: 'Invalid template_id: must be a positive integer' });
        return;
      }

      // Ensure location_id is a positive integer
      const locationIdNum = typeof location_id === 'number' ? location_id : parseInt(String(location_id), 10);
      if (isNaN(locationIdNum) || locationIdNum < 1) {
        res.status(400).json({ success: false, message: 'Invalid location_id: must be a positive integer' });
        return;
      }

      // Validate location_type is a valid enum value
      const validLocationTypes = Object.values(ItemLocationType);
      if (!validLocationTypes.includes(location_type)) {
        res.status(400).json({ success: false, message: `Invalid location_type: must be one of ${validLocationTypes.join(', ')}` });
        return;
      }

      // Validate condition if provided
      if (condition) {
        const validConditions = Object.values(ItemCondition);
        if (!validConditions.includes(condition)) {
          res.status(400).json({ success: false, message: `Invalid condition: must be one of ${validConditions.join(', ')}` });
          return;
        }
      }

      const instance = await itemRepo.createInstance({
        template_id: templateIdNum,
        location_type,
        location_id: locationIdNum,
        equipped_slot,
        quantity: quantity ?? 1,
        condition: condition ?? ItemCondition.PRISTINE,
        charges_remaining,
        fuel_remaining,
        custom_data: custom_data ?? {},
      });

      res.json({ success: true, instance });
    } catch (error) {
      console.error('Failed to create item instance:', error);
      res.status(500).json({ success: false, message: 'Failed to create item instance' });
    }
  });

  // Update item instance
  app.put('/api/items/instances/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid instance ID' });
        return;
      }

      const { location_type, location_id, equipped_slot, quantity, condition, custom_data } = req.body;

      // Validate inputs before any database operations
      if (location_type !== undefined && typeof location_type !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid location_type: must be a string' });
        return;
      }
      if (location_id !== undefined) {
        const locationIdNum = typeof location_id === 'number' ? location_id : parseInt(String(location_id), 10);
        if (isNaN(locationIdNum) || locationIdNum < 1) {
          res.status(400).json({ success: false, message: 'Invalid location_id: must be a positive integer' });
          return;
        }
      }
      if (quantity !== undefined) {
        const quantityNum = typeof quantity === 'number' ? quantity : parseInt(String(quantity), 10);
        if (isNaN(quantityNum) || quantityNum < 1) {
          res.status(400).json({ success: false, message: 'Invalid quantity: must be a positive integer' });
          return;
        }
      }
      if (condition !== undefined && typeof condition !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid condition: must be a string' });
        return;
      }

      // Verify instance exists first
      const existing = await itemRepo.getInstanceById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Instance not found' });
        return;
      }

      // Perform all updates atomically within a transaction
      await withTransaction(async (client) => {
        // Update location if provided
        if (location_type && location_id !== undefined) {
          await itemRepo.updateInstanceLocation(id, location_type, location_id, equipped_slot, client);
        }

        // Update quantity if provided
        if (quantity !== undefined) {
          await itemRepo.updateInstanceQuantity(id, quantity, client);
        }

        // Update condition if provided
        if (condition) {
          await itemRepo.updateInstanceCondition(id, condition, client);
        }

        // Update custom_data if provided
        if (custom_data) {
          await itemRepo.updateInstanceCustomData(id, custom_data, client);
        }
      });

      const instance = await itemRepo.getInstanceById(id);
      res.json({ success: true, instance });
    } catch (error) {
      console.error('Failed to update item instance:', error);
      res.status(500).json({ success: false, message: 'Failed to update item instance' });
    }
  });

  // Delete item instance
  app.delete('/api/items/instances/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid instance ID' });
        return;
      }

      const success = await itemRepo.deleteInstance(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Instance not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete item instance:', error);
      res.status(500).json({ success: false, message: 'Failed to delete item instance' });
    }
  });

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  // Export all templates
  app.get('/api/items/export', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const templates = await itemRepo.getAllTemplates();
      const recipes = await craftingRepo.getAllRecipes();
      const enchantments = await craftingRepo.getAllEnchantments();

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        templates,
        recipes,
        enchantments,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="items_export.json"');
      res.json(exportData);
    } catch (error) {
      console.error('Failed to export items:', error);
      res.status(500).json({ success: false, message: 'Failed to export items' });
    }
  });

  // Import templates
  app.post('/api/items/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { templates, merge = true } = req.body;

      if (!templates || !Array.isArray(templates)) {
        res.status(400).json({ success: false, message: 'templates array is required' });
        return;
      }

      // Validate each template has required fields
      for (let i = 0; i < templates.length; i++) {
        const t = templates[i];
        if (!t || typeof t !== 'object') {
          res.status(400).json({ success: false, message: `Template at index ${i} is invalid` });
          return;
        }
        if (!t.name || typeof t.name !== 'string' || t.name.trim() === '') {
          res.status(400).json({ success: false, message: `Template at index ${i} missing required 'name' field` });
          return;
        }
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      };

      // Execute all operations atomically within a single transaction
      // This ensures consistency between existence checks and mutations
      try {
        await withTransaction(async (client) => {
          for (const template of templates) {
            const existing = await itemRepo.getTemplateByName(template.name, client);

            if (existing && merge) {
              await itemRepo.updateTemplate(existing.id, template, client);
              results.updated++;
            } else if (!existing) {
              const { id, ...templateData } = template;
              await itemRepo.createTemplate(templateData, client);
              results.created++;
            } else {
              results.errors.push(`Skipped "${template.name}": already exists (merge disabled)`);
            }
          }
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.errors.push(`Transaction failed, all changes rolled back: ${errorMessage}`);
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Failed to import items:', error);
      res.status(500).json({ success: false, message: 'Failed to import items' });
    }
  });

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  // Get item types enum
  app.get('/api/items/types', requireDeveloper, (_req: Request, res: Response) => {
    res.json({
      success: true,
      item_types: Object.values(ItemType),
      equipment_slots: Object.values(EquipmentSlot),
      location_types: Object.values(ItemLocationType),
      conditions: Object.values(ItemCondition),
    });
  });

  // Spawn item in room (convenience endpoint)
  app.post('/api/items/spawn', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { template_id, room_id, quantity = 1 } = req.body;

      if (!template_id || !room_id) {
        res.status(400).json({ success: false, message: 'template_id and room_id are required' });
        return;
      }

      // Validate numeric inputs
      const templateIdNum = parseInt(template_id, 10);
      const roomIdNum = parseInt(room_id, 10);
      const quantityNum = parseInt(quantity, 10);

      if (isNaN(templateIdNum) || templateIdNum < 1) {
        res.status(400).json({ success: false, message: 'Invalid template_id: must be a positive integer' });
        return;
      }
      if (isNaN(roomIdNum) || roomIdNum < 1) {
        res.status(400).json({ success: false, message: 'Invalid room_id: must be a positive integer' });
        return;
      }
      if (isNaN(quantityNum) || quantityNum < 1) {
        res.status(400).json({ success: false, message: 'Invalid quantity: must be a positive integer' });
        return;
      }

      const template = await itemRepo.getTemplateById(templateIdNum);
      if (!template) {
        res.status(404).json({ success: false, message: 'Template not found' });
        return;
      }

      const instance = await itemRepo.createInstance({
        template_id: templateIdNum,
        location_type: ItemLocationType.ROOM,
        location_id: roomIdNum,
        quantity: quantityNum,
      });

      res.json({ success: true, instance, message: `Spawned ${template.name} in room ${roomIdNum}` });
    } catch (error) {
      console.error('Failed to spawn item:', error);
      res.status(500).json({ success: false, message: 'Failed to spawn item' });
    }
  });
}
