import { Express, Request, Response } from 'express';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as craftingRepo from '../db/repositories/craftingRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { ItemType, ItemLocationType, ItemCondition, EquipmentSlot } from '@koa/shared';

export function setupItemRoutes(app: Express): void {
  // ============================================================================
  // ITEM TEMPLATES
  // ============================================================================

  // Get all item templates
  app.get('/api/items/templates', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const templates = await itemRepo.getAllTemplates();
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
        requirements, stat_modifiers, effect_slots, base_effects
      } = req.body;

      if (!name || !short_desc || !item_type) {
        res.status(400).json({ success: false, message: 'Name, short_desc, and item_type are required' });
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

      // Update template using raw SQL since we don't have an update function
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
      const { location_type, location_id, template_id } = req.query;
      
      let instances;
      if (location_type === 'room' && location_id) {
        instances = await itemRepo.getInstancesInRoom(parseInt(location_id as string));
      } else if (location_type === 'player' && location_id) {
        instances = await itemRepo.getPlayerInventory(parseInt(location_id as string));
      } else {
        // Get all instances (need to add this function)
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

      if (!template_id || !location_type || location_id === undefined) {
        res.status(400).json({ success: false, message: 'template_id, location_type, and location_id are required' });
        return;
      }

      const instance = await itemRepo.createInstance({
        template_id,
        location_type,
        location_id,
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

      // Update location if provided
      if (location_type && location_id !== undefined) {
        await itemRepo.updateInstanceLocation(id, location_type, location_id, equipped_slot);
      }

      // Update quantity if provided
      if (quantity !== undefined) {
        await itemRepo.updateInstanceQuantity(id, quantity);
      }

      // Update condition if provided
      if (condition) {
        await itemRepo.updateInstanceCondition(id, condition);
      }

      // Update custom_data if provided
      if (custom_data) {
        await itemRepo.updateInstanceCustomData(id, custom_data);
      }

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

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      };

      for (const template of templates) {
        try {
          // Check if template with same name exists
          const existing = await itemRepo.getTemplateByName(template.name);
          
          if (existing && merge) {
            // Update existing
            await itemRepo.updateTemplate(existing.id, template);
            results.updated++;
          } else if (!existing) {
            // Create new (without id to let DB assign)
            const { id, ...templateData } = template;
            await itemRepo.createTemplate(templateData);
            results.created++;
          }
        } catch (err) {
          results.errors.push(`Failed to import "${template.name}": ${err}`);
        }
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

      const template = await itemRepo.getTemplateById(template_id);
      if (!template) {
        res.status(404).json({ success: false, message: 'Template not found' });
        return;
      }

      const instance = await itemRepo.createInstance({
        template_id,
        location_type: ItemLocationType.ROOM,
        location_id: room_id,
        quantity,
      });

      res.json({ success: true, instance, message: `Spawned ${template.short_desc} in room ${room_id}` });
    } catch (error) {
      console.error('Failed to spawn item:', error);
      res.status(500).json({ success: false, message: 'Failed to spawn item' });
    }
  });
}
