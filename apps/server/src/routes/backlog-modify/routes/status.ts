/**
 * GET /status endpoint - Check if backlog modify generation is running
 */

import type { Request, Response } from 'express';
import { getBacklogModifyStatus } from '../common.js';

export function createStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    const status = getBacklogModifyStatus();
    res.json({ success: true, ...status });
  };
}
