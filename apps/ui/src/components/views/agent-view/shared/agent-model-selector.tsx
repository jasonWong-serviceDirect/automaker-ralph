import { ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAppStore, type ModelAlias } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { CLAUDE_MODELS, CURSOR_MODELS } from '@/components/views/board-view/shared/model-constants';
import type { CursorModelId } from '@automaker/types';
import { getModelProvider, stripProviderPrefix } from '@automaker/types';

interface AgentModelSelectorProps {
  selectedModel: ModelAlias | CursorModelId;
  onModelSelect: (model: ModelAlias | CursorModelId) => void;
  disabled?: boolean;
}

export function AgentModelSelector({
  selectedModel,
  onModelSelect,
  disabled,
}: AgentModelSelectorProps) {
  const { enabledCursorModels } = useAppStore();
  const { cursorCliStatus } = useSetupStore();

  // Check if Cursor CLI is available
  const isCursorAvailable = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  // Filter cursor models by enabled settings
  const filteredCursorModels = CURSOR_MODELS.filter((model) => {
    const modelId = stripProviderPrefix(model.id) as CursorModelId;
    return enabledCursorModels.includes(modelId);
  });

  // Determine current provider and display label
  const currentProvider = getModelProvider(selectedModel);
  const currentModel =
    currentProvider === 'cursor'
      ? CURSOR_MODELS.find((m) => m.id === selectedModel)
      : CLAUDE_MODELS.find((m) => m.id === selectedModel);

  // Get display label (strip "Claude " prefix for brevity)
  const displayLabel = currentModel?.label.replace('Claude ', '') || 'Sonnet';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 gap-1 text-xs font-medium rounded-xl border-border px-2.5"
          disabled={disabled}
          data-testid="model-selector"
        >
          {currentProvider === 'cursor' && (
            <span className="w-2 h-2 rounded-full bg-purple-500 mr-1" />
          )}
          {displayLabel}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
        {/* Claude Models Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Claude</DropdownMenuLabel>
        {CLAUDE_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelSelect(model.id as ModelAlias)}
            className={cn('cursor-pointer', selectedModel === model.id && 'bg-accent')}
            data-testid={`model-option-${model.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{model.label}</span>
              <span className="text-xs text-muted-foreground">{model.description}</span>
            </div>
          </DropdownMenuItem>
        ))}

        {/* Cursor Models Section */}
        {filteredCursorModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
              Cursor CLI
              {!isCursorAvailable && (
                <span className="text-amber-500 flex items-center gap-1 ml-auto">
                  <AlertCircle className="w-3 h-3" />
                  Setup required
                </span>
              )}
            </DropdownMenuLabel>
            {filteredCursorModels.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => onModelSelect(model.id as CursorModelId)}
                className={cn(
                  'cursor-pointer',
                  selectedModel === model.id && 'bg-accent',
                  !isCursorAvailable && 'opacity-50'
                )}
                disabled={!isCursorAvailable}
                data-testid={`model-option-${model.id}`}
              >
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.label}</span>
                    {model.hasThinking && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        Thinking
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{model.description}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
