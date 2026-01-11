/**
 * Generate backlog modify plan using Claude AI
 *
 * Similar to generate-plan.ts but:
 * - Only shows features in backlog or in_progress status
 * - Uses modify-specific prompts that focus on updating existing features
 * - Does not allow add or delete operations
 *
 * Model is configurable via phaseModels.backlogPlanningModel in settings
 * (defaults to Sonnet). Can be overridden per-call via model parameter.
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, BacklogPlanResult, BacklogChange } from '@automaker/types';
import { DEFAULT_PHASE_MODELS, isCursorModel, type ThinkingLevel } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { FeatureLoader } from '../../services/feature-loader.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import { logger, setRunningState, getErrorMessage } from './common.js';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../../lib/settings-helpers.js';

const featureLoader = new FeatureLoader();

/**
 * Format features for the AI prompt (only backlog and in_progress)
 */
function formatFeaturesForPrompt(features: Feature[]): string {
  // Filter to only backlog and in_progress status
  const eligibleFeatures = features.filter(
    (f) => f.status === 'backlog' || f.status === 'in_progress'
  );

  if (eligibleFeatures.length === 0) {
    return 'No features in backlog or in progress.';
  }

  return eligibleFeatures
    .map((f) => {
      const deps = f.dependencies?.length ? `Dependencies: [${f.dependencies.join(', ')}]` : '';
      const priority = f.priority !== undefined ? `Priority: ${f.priority}` : '';
      return `- ID: ${f.id}
  Title: ${f.title || 'Untitled'}
  Description: ${f.description}
  Category: ${f.category}
  Status: ${f.status}
  ${priority}
  ${deps}`.trim();
    })
    .join('\n\n');
}

/**
 * Parse the AI response into a BacklogPlanResult
 * Filter out any non-update changes (should only have updates)
 */
function parseModifyResponse(response: string): BacklogPlanResult {
  // Use shared JSON extraction utility for robust parsing
  const parsed = extractJsonWithArray<BacklogPlanResult>(response, 'changes', {
    logger,
  });

  if (parsed) {
    // Filter to only update changes (ignore any adds or deletes the AI might have included)
    const updateChanges = parsed.changes.filter((c) => c.type === 'update');
    return {
      ...parsed,
      changes: updateChanges,
      dependencyUpdates: [], // No dependency updates for modify-only operations
    };
  }

  // If parsing fails, log details and return an empty result
  logger.warn('[BacklogModify] Failed to parse AI response as JSON');
  logger.warn('[BacklogModify] Response text length:', response.length);
  logger.warn('[BacklogModify] Response preview:', response.slice(0, 500));
  if (response.length === 0) {
    logger.error('[BacklogModify] Response text is EMPTY! No content was extracted from stream.');
  }
  return {
    changes: [],
    summary: 'Failed to parse AI response',
    dependencyUpdates: [],
  };
}

/**
 * Generate a backlog modification plan based on user prompt
 * Only modifies existing features in backlog or in_progress status
 */
export async function generateBacklogModify(
  projectPath: string,
  prompt: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  model?: string
): Promise<BacklogPlanResult> {
  try {
    // Load current features
    const features = await featureLoader.getAll(projectPath);
    const eligibleFeatures = features.filter(
      (f) => f.status === 'backlog' || f.status === 'in_progress'
    );

    events.emit('backlog-modify:event', {
      type: 'backlog_modify_progress',
      content: `Loaded ${eligibleFeatures.length} features (backlog/in_progress) from ${features.length} total`,
    });

    // Load prompts from settings (using backlogModify prompts)
    const prompts = await getPromptCustomization(settingsService, '[BacklogModify]');

    // Build the system prompt
    const systemPrompt = prompts.backlogModify.systemPrompt;

    // Build the user prompt from template
    const currentFeatures = formatFeaturesForPrompt(features);
    const userPrompt = prompts.backlogModify.userPromptTemplate
      .replace('{{currentFeatures}}', currentFeatures)
      .replace('{{userRequest}}', prompt);

    events.emit('backlog-modify:event', {
      type: 'backlog_modify_progress',
      content: 'Generating modifications with AI...',
    });

    // Get the model to use from settings or provided override
    let effectiveModel = model;
    let thinkingLevel: ThinkingLevel | undefined;
    if (!effectiveModel) {
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.backlogPlanningModel || DEFAULT_PHASE_MODELS.backlogPlanningModel;
      const resolved = resolvePhaseModel(phaseModelEntry);
      effectiveModel = resolved.model;
      thinkingLevel = resolved.thinkingLevel;
    }
    logger.info('[BacklogModify] Using model:', effectiveModel);

    const provider = ProviderFactory.getProviderForModel(effectiveModel);

    // Get autoLoadClaudeMd setting
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[BacklogModify]'
    );

    // For Cursor models, we need to combine prompts with explicit instructions
    // because Cursor doesn't support systemPrompt separation like Claude SDK
    let finalPrompt = userPrompt;
    let finalSystemPrompt: string | undefined = systemPrompt;

    if (isCursorModel(effectiveModel)) {
      logger.info(
        '[BacklogModify] Using Cursor model - adding explicit no-file-write instructions'
      );
      finalPrompt = `${systemPrompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. DO NOT use Write, Edit, or any file modification tools.
3. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
4. Your entire response should be valid JSON starting with { and ending with }.
5. No text before or after the JSON object.
6. ONLY include "update" type changes - no "add" or "delete".

${userPrompt}`;
      finalSystemPrompt = undefined; // System prompt is now embedded in the user prompt
    }

    // Execute the query
    const stream = provider.executeQuery({
      prompt: finalPrompt,
      model: effectiveModel,
      cwd: projectPath,
      systemPrompt: finalSystemPrompt,
      maxTurns: 1,
      allowedTools: [], // No tools needed for this
      abortController,
      settingSources: autoLoadClaudeMd ? ['user', 'project'] : undefined,
      readOnly: true, // Modify generation only generates text, doesn't write files
      thinkingLevel, // Pass thinking level for extended thinking
    });

    let responseText = '';

    for await (const msg of stream) {
      if (abortController.signal.aborted) {
        throw new Error('Generation aborted');
      }

      if (msg.type === 'assistant') {
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }
      } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
        // Use result if it's a final accumulated message (from Cursor provider)
        logger.info('[BacklogModify] Received result from Cursor, length:', msg.result.length);
        logger.info('[BacklogModify] Previous responseText length:', responseText.length);
        if (msg.result.length > responseText.length) {
          logger.info('[BacklogModify] Using Cursor result (longer than accumulated text)');
          responseText = msg.result;
        } else {
          logger.info('[BacklogModify] Keeping accumulated text (longer than Cursor result)');
        }
      }
    }

    // Parse the response
    const result = parseModifyResponse(responseText);

    events.emit('backlog-modify:event', {
      type: 'backlog_modify_complete',
      result,
    });

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error('[BacklogModify] Generation failed:', errorMessage);

    events.emit('backlog-modify:event', {
      type: 'backlog_modify_error',
      error: errorMessage,
    });

    throw error;
  } finally {
    setRunningState(false, null);
  }
}
