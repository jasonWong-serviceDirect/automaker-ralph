/**
 * POST /generate endpoint - Generate a backlog modify plan
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import { getBacklogModifyStatus, setRunningState, getErrorMessage, logError } from '../common.js';
import { generateBacklogModify } from '../generate-modify.js';
import type { SettingsService } from '../../../services/settings-service.js';

export function createGenerateHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prompt, model } = req.body as {
        projectPath: string;
        prompt: string;
        model?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!prompt) {
        res.status(400).json({ success: false, error: 'prompt required' });
        return;
      }

      const { isRunning } = getBacklogModifyStatus();
      if (isRunning) {
        res.json({
          success: false,
          error: 'Backlog modify generation is already running',
        });
        return;
      }

      setRunningState(true);
      const abortController = new AbortController();
      setRunningState(true, abortController);

      // Start generation in background
      generateBacklogModify(projectPath, prompt, events, abortController, settingsService, model)
        .catch((error) => {
          logError(error, 'Generate backlog modify failed (background)');
          events.emit('backlog-modify:event', {
            type: 'backlog_modify_error',
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          setRunningState(false, null);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Generate backlog modify failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
