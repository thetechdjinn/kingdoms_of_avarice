import { Express, Request, Response } from 'express';
import * as actionRepo from '../db/repositories/actionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { initializeActionCommands } from '../game/actionCommands.js';

// Validate action object structure and field values for creation (required fields)
function validateActionInput(action: Record<string, unknown>): string | null {
  if (!action.command || typeof action.command !== 'string') {
    return 'command is required and must be a string';
  }
  if (!action.firstPersonNoTarget || typeof action.firstPersonNoTarget !== 'string') {
    return 'firstPersonNoTarget is required and must be a string';
  }
  if (!action.roomNoTarget || typeof action.roomNoTarget !== 'string') {
    return 'roomNoTarget is required and must be a string';
  }
  return null;
}

// Validate optional string fields in update payload
function validateUpdateFields(body: Record<string, unknown>): string | null {
  const stringFields = [
    'command', 'description', 'firstPersonNoTarget', 'roomNoTarget',
    'firstPersonWithTarget', 'targetPerspective', 'roomWithTarget'
  ];
  for (const field of stringFields) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      return `${field} must be a string`;
    }
  }
  return null;
}

export function setupActionRoutes(app: Express): void {
  // ============================================================================
  // ACTION DEFINITIONS
  // ============================================================================

  // Get all actions
  app.get('/api/actions', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const actions = await actionRepo.getAllActions();
      res.json({ success: true, actions });
    } catch (error) {
      console.error('Failed to get actions:', error);
      res.status(500).json({ success: false, message: 'Failed to get actions' });
    }
  });

  // Get single action
  app.get('/api/actions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid action ID' });
        return;
      }

      const action = await actionRepo.getActionById(id);
      if (!action) {
        res.status(404).json({ success: false, message: 'Action not found' });
        return;
      }

      res.json({ success: true, action });
    } catch (error) {
      console.error('Failed to get action:', error);
      res.status(500).json({ success: false, message: 'Failed to get action' });
    }
  });

  // Create action
  app.post('/api/actions', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const validationError = validateActionInput(req.body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      const {
        command, description, firstPersonNoTarget, roomNoTarget,
        firstPersonWithTarget, targetPerspective, roomWithTarget
      } = req.body;

      // Check for duplicate command
      const existingCommand = await actionRepo.getActionByCommand(command);
      if (existingCommand) {
        res.status(400).json({ success: false, message: `Command "${command}" is already in use` });
        return;
      }

      const action = await actionRepo.createAction({
        command,
        description,
        firstPersonNoTarget,
        roomNoTarget,
        firstPersonWithTarget,
        targetPerspective,
        roomWithTarget,
      });

      // Refresh action command cache
      await initializeActionCommands();

      res.json({ success: true, action });
    } catch (error) {
      console.error('Failed to create action:', error);
      res.status(500).json({ success: false, message: 'Failed to create action' });
    }
  });

  // Update action
  app.put('/api/actions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid action ID' });
        return;
      }

      const existing = await actionRepo.getActionById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Action not found' });
        return;
      }

      // Validate field types
      const validationError = validateUpdateFields(req.body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      // Check for duplicate command if command is being changed
      const { command } = req.body;
      if (command && command.toLowerCase() !== existing.command.toLowerCase()) {
        const existingCommand = await actionRepo.getActionByCommand(command);
        if (existingCommand) {
          res.status(400).json({ success: false, message: `Command "${command}" is already in use` });
          return;
        }
      }

      const action = await actionRepo.updateAction(id, req.body);

      // Refresh action command cache
      await initializeActionCommands();

      res.json({ success: true, action });
    } catch (error) {
      console.error('Failed to update action:', error);
      res.status(500).json({ success: false, message: 'Failed to update action' });
    }
  });

  // Delete action
  app.delete('/api/actions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid action ID' });
        return;
      }

      const success = await actionRepo.deleteAction(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Action not found' });
        return;
      }

      // Refresh action command cache
      await initializeActionCommands();

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete action:', error);
      res.status(500).json({ success: false, message: 'Failed to delete action' });
    }
  });

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  // Export all actions
  app.get('/api/actions/export/all', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const actions = await actionRepo.getAllActions();

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        actions,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="actions_export.json"');
      res.json(exportData);
    } catch (error) {
      console.error('Failed to export actions:', error);
      res.status(500).json({ success: false, message: 'Failed to export actions' });
    }
  });

  // Import actions
  app.post('/api/actions/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { actions, merge = true } = req.body;

      if (!actions || !Array.isArray(actions)) {
        res.status(400).json({ success: false, message: 'actions array is required' });
        return;
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      };

      for (const action of actions) {
        try {
          // Validate action structure
          const validationError = validateActionInput(action);
          if (validationError) {
            results.errors.push(`Invalid action "${action.command || 'unknown'}": ${validationError}`);
            continue;
          }

          const existing = await actionRepo.getActionByCommand(action.command);

          if (existing && merge) {
            await actionRepo.updateAction(existing.id, action);
            results.updated++;
          } else if (!existing) {
            await actionRepo.createAction(action);
            results.created++;
          } else {
            results.errors.push(`Skipped "${action.command}": command already exists (merge disabled)`);
          }
        } catch (err) {
          results.errors.push(`Failed to import "${action.command}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Refresh action command cache
      await initializeActionCommands();

      res.json({ success: true, results });
    } catch (error) {
      console.error('Failed to import actions:', error);
      res.status(500).json({ success: false, message: 'Failed to import actions' });
    }
  });
}
