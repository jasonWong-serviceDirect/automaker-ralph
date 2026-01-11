import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Pencil, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  BacklogPlanResult,
  BacklogChange,
  ModelAlias,
  CursorModelId,
  PhaseModelEntry,
} from '@automaker/types';
import { ModelOverrideTrigger } from '@/components/shared/model-override-trigger';
import { useAppStore } from '@/store/app-store';

/**
 * Normalize PhaseModelEntry or string to PhaseModelEntry
 */
function normalizeEntry(entry: PhaseModelEntry | string): PhaseModelEntry {
  if (typeof entry === 'string') {
    return { model: entry as ModelAlias | CursorModelId };
  }
  return entry;
}

interface BacklogModifyDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  onModifyApplied?: () => void;
  // Props for background generation
  pendingModifyResult: BacklogPlanResult | null;
  setPendingModifyResult: (result: BacklogPlanResult | null) => void;
  isGeneratingModify: boolean;
  setIsGeneratingModify: (generating: boolean) => void;
}

type DialogMode = 'input' | 'review' | 'applying';

export function BacklogModifyDialog({
  open,
  onClose,
  projectPath,
  onModifyApplied,
  pendingModifyResult,
  setPendingModifyResult,
  isGeneratingModify,
  setIsGeneratingModify,
}: BacklogModifyDialogProps) {
  const [mode, setMode] = useState<DialogMode>('input');
  const [prompt, setPrompt] = useState('');
  const [expandedChanges, setExpandedChanges] = useState<Set<number>>(new Set());
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set());
  const [modelOverride, setModelOverride] = useState<PhaseModelEntry | null>(null);

  const { phaseModels } = useAppStore();

  // Set mode based on whether we have a pending result
  useEffect(() => {
    if (open) {
      if (pendingModifyResult) {
        setMode('review');
        // Select all changes by default
        setSelectedChanges(new Set(pendingModifyResult.changes.map((_, i) => i)));
        setExpandedChanges(new Set());
      } else {
        setMode('input');
      }
    }
  }, [open, pendingModifyResult]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('Please enter modification instructions');
      return;
    }

    const api = getElectronAPI();
    if (!api?.backlogModify) {
      toast.error('API not available');
      return;
    }

    // Start generation in background
    setIsGeneratingModify(true);

    // Use model override if set, otherwise use global default
    const effectiveModelEntry = modelOverride || normalizeEntry(phaseModels.backlogPlanningModel);
    const effectiveModel = effectiveModelEntry.model;
    const result = await api.backlogModify.generate(projectPath, prompt, effectiveModel);
    if (!result.success) {
      setIsGeneratingModify(false);
      toast.error(result.error || 'Failed to start modification generation');
      return;
    }

    // Show toast and close dialog - generation runs in background
    toast.info('Generating modifications... This will be ready soon!', {
      duration: 3000,
    });
    setPrompt('');
    onClose();
  }, [projectPath, prompt, modelOverride, phaseModels, setIsGeneratingModify, onClose]);

  const handleApply = useCallback(async () => {
    if (!pendingModifyResult) return;

    // Filter to only selected changes
    const selectedChangesList = pendingModifyResult.changes.filter((_, index) =>
      selectedChanges.has(index)
    );

    if (selectedChangesList.length === 0) {
      toast.error('Please select at least one modification to apply');
      return;
    }

    const api = getElectronAPI();
    if (!api?.backlogModify) {
      toast.error('API not available');
      return;
    }

    setMode('applying');

    // Create a filtered result with only selected changes
    const filteredResult: BacklogPlanResult = {
      ...pendingModifyResult,
      changes: selectedChangesList,
      dependencyUpdates: [],
    };

    const result = await api.backlogModify.apply(projectPath, filteredResult);
    if (result.success) {
      toast.success(`Applied ${result.appliedChanges?.length || 0} modifications`);
      setPendingModifyResult(null);
      onModifyApplied?.();
      onClose();
    } else {
      toast.error(result.error || 'Failed to apply modifications');
      setMode('review');
    }
  }, [
    projectPath,
    pendingModifyResult,
    selectedChanges,
    setPendingModifyResult,
    onModifyApplied,
    onClose,
  ]);

  const handleDiscard = useCallback(() => {
    setPendingModifyResult(null);
    setMode('input');
  }, [setPendingModifyResult]);

  const toggleChangeExpanded = (index: number) => {
    setExpandedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleChangeSelected = (index: number) => {
    setSelectedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAllChanges = () => {
    if (!pendingModifyResult) return;
    if (selectedChanges.size === pendingModifyResult.changes.length) {
      setSelectedChanges(new Set());
    } else {
      setSelectedChanges(new Set(pendingModifyResult.changes.map((_, i) => i)));
    }
  };

  const getChangeLabel = (change: BacklogChange) => {
    return `Modify: ${change.featureId}`;
  };

  const renderContent = () => {
    switch (mode) {
      case 'input':
        return (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Describe how you want to modify existing features in your backlog and in-progress
              items. The AI will analyze each feature and apply your instructions.
            </div>
            <Textarea
              placeholder="e.g., Add acceptance criteria to all features. Or: Update descriptions to include error handling requirements. Or: Add priority field based on complexity."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[150px] resize-none"
              autoFocus
            />
            <div className="text-xs text-muted-foreground">
              Only features in "Backlog" or "In Progress" status will be modified. Completed and
              verified features are not affected.
            </div>
            {isGeneratingModify && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Modifications are being generated in the background...
              </div>
            )}
          </div>
        );

      case 'review':
        if (!pendingModifyResult) return null;

        const allSelected = selectedChanges.size === pendingModifyResult.changes.length;
        const someSelected = selectedChanges.size > 0 && !allSelected;

        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-2">Summary</h4>
              <p className="text-sm text-muted-foreground">{pendingModifyResult.summary}</p>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-yellow-600">
                <Pencil className="w-4 h-4" /> {pendingModifyResult.changes.length} modifications
              </span>
            </div>

            {/* Select all */}
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                id="select-all"
                checked={allSelected}
                // @ts-expect-error - indeterminate is valid but not in types
                indeterminate={someSelected}
                onCheckedChange={toggleAllChanges}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                {allSelected ? 'Deselect all' : 'Select all'} ({selectedChanges.size}/
                {pendingModifyResult.changes.length})
              </label>
            </div>

            {/* Changes list */}
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {pendingModifyResult.changes.map((change, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-lg border p-3 border-yellow-500/30 bg-yellow-500/5',
                    !selectedChanges.has(index) && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedChanges.has(index)}
                      onCheckedChange={() => toggleChangeSelected(index)}
                    />
                    <button
                      className="flex-1 flex items-center gap-2 text-left"
                      onClick={() => toggleChangeExpanded(index)}
                    >
                      {expandedChanges.has(index) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Pencil className="w-4 h-4 text-yellow-500" />
                      <span className="font-medium text-sm">{getChangeLabel(change)}</span>
                    </button>
                  </div>

                  {expandedChanges.has(index) && (
                    <div className="mt-3 pl-10 space-y-2 text-sm">
                      <p className="text-muted-foreground">{change.reason}</p>
                      {change.feature && (
                        <div className="rounded bg-background/50 p-2 text-xs font-mono">
                          {change.feature.title && (
                            <p className="text-foreground">
                              <strong>Title:</strong> {change.feature.title}
                            </p>
                          )}
                          {change.feature.description && (
                            <p className="text-foreground mt-1">
                              <strong>Description:</strong> {change.feature.description}
                            </p>
                          )}
                          {change.feature.category && (
                            <p className="text-muted-foreground mt-1">
                              <strong>Category:</strong> {change.feature.category}
                            </p>
                          )}
                          {change.feature.priority !== undefined && (
                            <p className="text-muted-foreground mt-1">
                              <strong>Priority:</strong> {change.feature.priority}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'applying':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Applying modifications...</p>
          </div>
        );
    }
  };

  // Get effective model entry (override or global default)
  const effectiveModelEntry = modelOverride || normalizeEntry(phaseModels.backlogPlanningModel);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            {mode === 'review' ? 'Review Modifications' : 'Modify Existing Features'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'review'
              ? 'Select which modifications to apply to your features'
              : 'Use AI to modify existing features in your backlog and in-progress items'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">{renderContent()}</div>

        <DialogFooter>
          {mode === 'input' && (
            <>
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-xs text-muted-foreground">Model:</span>
                <ModelOverrideTrigger
                  currentModelEntry={effectiveModelEntry}
                  onModelChange={setModelOverride}
                  phase="backlogPlanningModel"
                  size="sm"
                  variant="button"
                  isOverridden={modelOverride !== null}
                />
              </div>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={!prompt.trim() || isGeneratingModify}>
                {isGeneratingModify ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4 mr-2" />
                    Generate Modifications
                  </>
                )}
              </Button>
            </>
          )}

          {mode === 'review' && (
            <>
              <Button variant="outline" onClick={handleDiscard}>
                Discard
              </Button>
              <Button variant="outline" onClick={onClose}>
                Review Later
              </Button>
              <Button onClick={handleApply} disabled={selectedChanges.size === 0}>
                <Check className="w-4 h-4 mr-2" />
                Apply {selectedChanges.size} Modification{selectedChanges.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
