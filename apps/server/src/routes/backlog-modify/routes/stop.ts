/**
 * POST /stop endpoint - Stop a running backlog modify generation
 */

import type { Request, Response } from 'express';
import { getAbortController, setRunningState } from '../common.js';

export function createStopHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    const abortController = getAbortController();
    if (abortController) {
      abortController.abort();
      setRunningState(false, null);
      res.json({ success: true, message: 'Generation stopped' });
    } else {
      res.json({ success: true, message: 'No generation running' });
    }
  };
}
