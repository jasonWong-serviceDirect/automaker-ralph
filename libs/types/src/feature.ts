/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel } from './settings.js';

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  thinkingLevel?: ThinkingLevel;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  error?: string;
  summary?: string;
  startedAt?: string;
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';

/**
 * Determines if a feature is UI-related based on category and description.
 * Used to decide whether Chrome mode should be enabled for visual verification.
 */
export function isUiFeature(feature: {
  category: string;
  description: string;
  title?: string;
}): boolean {
  // Category-based classification - these are clearly UI-related
  const uiCategories = ['ui', 'enhancement'];
  if (uiCategories.includes(feature.category.toLowerCase())) {
    return true;
  }

  // For ambiguous categories, check description for UI keywords
  const desc = (feature.description + ' ' + (feature.title || '')).toLowerCase();
  const uiKeywords = [
    'button',
    'modal',
    'dialog',
    'form',
    'input',
    'display',
    'component',
    'page',
    'view',
    'dashboard',
    'layout',
    'style',
    'css',
    'visual',
    'ui',
    'interface',
    'screen',
    'panel',
    'menu',
    'navigation',
    'icon',
    'badge',
  ];

  return uiKeywords.some((keyword) => desc.includes(keyword));
}
