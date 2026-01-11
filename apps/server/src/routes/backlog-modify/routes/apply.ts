/**
 * POST /apply endpoint - Apply a backlog modify plan
 * Only processes update-type changes (no adds or deletes)
 */

import type { Request, Response } from 'express';
import type { BacklogPlanResult } from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError, logger } from '../common.js';

const featureLoader = new FeatureLoader();

export function createApplyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, plan } = req.body as {
        projectPath: string;
        plan: BacklogPlanResult;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!plan || !plan.changes) {
        res.status(400).json({ success: false, error: 'plan with changes required' });
        return;
      }

      const appliedChanges: string[] = [];

      // Load current features for validation
      const allFeatures = await featureLoader.getAll(projectPath);
      const featureMap = new Map(allFeatures.map((f) => [f.id, f]));

      // Only process update changes (filter out any adds/deletes that might have slipped through)
      const updates = plan.changes.filter((c) => c.type === 'update');

      for (const change of updates) {
        if (!change.featureId || !change.feature) continue;

        // Validate the feature exists and is in backlog or in_progress status
        const existingFeature = featureMap.get(change.featureId);
        if (!existingFeature) {
          logger.warn(`[BacklogModify] Feature ${change.featureId} not found, skipping`);
          continue;
        }

        if (existingFeature.status !== 'backlog' && existingFeature.status !== 'in_progress') {
          logger.warn(
            `[BacklogModify] Feature ${change.featureId} is not in backlog/in_progress status (${existingFeature.status}), skipping`
          );
          continue;
        }

        try {
          const updated = await featureLoader.update(projectPath, change.featureId, change.feature);
          appliedChanges.push(`updated:${change.featureId}`);
          featureMap.set(change.featureId, updated);
          logger.info(`[BacklogModify] Updated feature ${change.featureId}`);
        } catch (error) {
          logger.error(
            `[BacklogModify] Failed to update ${change.featureId}:`,
            getErrorMessage(error)
          );
        }
      }

      res.json({
        success: true,
        appliedChanges,
      });
    } catch (error) {
      logError(error, 'Apply backlog modify failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
