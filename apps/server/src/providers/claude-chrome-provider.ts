/**
 * Claude Chrome Provider - Executes queries using Claude CLI with Chrome integration
 *
 * Extends CliProvider with Claude Chrome-specific behavior:
 * - Uses `claude --chrome` for browser observation/interaction
 * - Streaming JSON output via `--output-format stream-json --verbose`
 * - Model suffix routing (e.g., claude-sonnet-4-chrome)
 *
 * This enables agents to observe and interact with browsers during feature implementation.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CliProvider, type CliSpawnConfig, type CliErrorInfo } from './cli-provider.js';
import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';
import { createLogger, isAbortError } from '@automaker/utils';
import { spawnJSONLProcess } from '@automaker/platform';

const logger = createLogger('ClaudeChromeProvider');

// =============================================================================
// Claude CLI Event Types
// =============================================================================

interface ClaudeSystemEvent {
  type: 'system';
  subtype: 'init';
  session_id: string;
  cwd: string;
  model: string;
  tools?: string[];
}

interface ClaudeAssistantEvent {
  type: 'assistant';
  session_id: string;
  message: {
    model: string;
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      tool_use_id?: string;
      input?: unknown;
      content?: string;
    }>;
    stop_reason: string | null;
  };
}

interface ClaudeResultEvent {
  type: 'result';
  subtype: 'success' | 'error';
  is_error: boolean;
  session_id: string;
  result?: string;
  error?: string;
}

type ClaudeStreamEvent = ClaudeSystemEvent | ClaudeAssistantEvent | ClaudeResultEvent;

// =============================================================================
// Error Codes
// =============================================================================

export enum ClaudeChromeErrorCode {
  NOT_INSTALLED = 'CLAUDE_CHROME_NOT_INSTALLED',
  NOT_AUTHENTICATED = 'CLAUDE_CHROME_NOT_AUTHENTICATED',
  CHROME_NOT_CONNECTED = 'CLAUDE_CHROME_NOT_CONNECTED',
  RATE_LIMITED = 'CLAUDE_CHROME_RATE_LIMITED',
  NETWORK_ERROR = 'CLAUDE_CHROME_NETWORK_ERROR',
  PROCESS_CRASHED = 'CLAUDE_CHROME_PROCESS_CRASHED',
  UNKNOWN = 'CLAUDE_CHROME_UNKNOWN_ERROR',
}

export interface ClaudeChromeError extends Error {
  code: ClaudeChromeErrorCode;
  recoverable: boolean;
  suggestion?: string;
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * ClaudeChromeProvider - Uses Claude CLI with Chrome integration
 *
 * Routes models ending in '-chrome' to Claude CLI with --chrome flag.
 * This enables browser observation and interaction during agent execution.
 */
export class ClaudeChromeProvider extends CliProvider {
  constructor(config: ProviderConfig = {}) {
    super(config);
    this.ensureCliDetected();
  }

  // ==========================================================================
  // CliProvider Abstract Method Implementations
  // ==========================================================================

  getName(): string {
    return 'claude-chrome';
  }

  getCliName(): string {
    return 'claude';
  }

  getSpawnConfig(): CliSpawnConfig {
    return {
      windowsStrategy: 'direct', // claude CLI has native Windows support
      commonPaths: {
        linux: [
          // NVM paths (common installation)
          ...this.getNvmPaths(),
          path.join(os.homedir(), '.claude', 'local', 'claude'),
          path.join(os.homedir(), '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
        ],
        darwin: [
          ...this.getNvmPaths(),
          path.join(os.homedir(), '.claude', 'local', 'claude'),
          path.join(os.homedir(), '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
        ],
        win32: [
          path.join(os.homedir(), '.claude', 'local', 'claude.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),
        ],
      },
    };
  }

  /**
   * Get NVM paths for claude CLI
   */
  private getNvmPaths(): string[] {
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    const nodeVersion = process.version; // e.g., v24.3.0
    return [path.join(nvmDir, 'versions', 'node', nodeVersion, 'bin', 'claude')];
  }

  /**
   * Override CLI detection to check common paths FIRST, then PATH.
   * This avoids finding old npm-installed versions in node_modules/.bin.
   */
  protected detectCli(): { cliPath: string | null; useWsl: boolean; strategy: 'native' } {
    const config = this.getSpawnConfig();
    const platform = process.platform as 'linux' | 'darwin' | 'win32';
    const paths = config.commonPaths[platform] || [];

    // Check NVM and common paths first
    for (const p of paths) {
      if (fs.existsSync(p)) {
        logger.debug(`Found claude at: ${p}`);
        return { cliPath: p, useWsl: false, strategy: 'native' };
      }
    }

    // Fall back to PATH (but this might find old versions)
    return super.detectCli() as { cliPath: string | null; useWsl: boolean; strategy: 'native' };
  }

  /**
   * Extract prompt text from ExecuteOptions
   */
  private extractPromptText(options: ExecuteOptions): string {
    if (typeof options.prompt === 'string') {
      return options.prompt;
    } else if (Array.isArray(options.prompt)) {
      return options.prompt
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('\n');
    } else {
      throw new Error('Invalid prompt format');
    }
  }

  buildCliArgs(options: ExecuteOptions): string[] {
    // Strip '-chrome' suffix if present, resolve aliases to full model strings
    let model = (options.model || 'claude-sonnet-4-20250514').replace(/-chrome$/, '');

    // Resolve common aliases to full model strings
    const aliases: Record<string, string> = {
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-5-20250929',
      opus: 'claude-opus-4-5-20251101',
    };
    model = aliases[model] || model;

    const cliArgs: string[] = [
      '--chrome', // Enable Chrome integration
      '-p', // Print mode (non-interactive)
      '--output-format',
      'stream-json',
      '--verbose', // Required for stream-json output
      '--model',
      model,
    ];

    // Add system prompt if provided (only string, not preset)
    if (options.systemPrompt && typeof options.systemPrompt === 'string') {
      cliArgs.push('--system-prompt', options.systemPrompt);
    }

    // Add allowed tools restriction if specified
    if (options.allowedTools && options.allowedTools.length === 0) {
      cliArgs.push('--tools', ''); // Empty string disables all tools
    }

    cliArgs.push('-'); // Read prompt from stdin

    return cliArgs;
  }

  /**
   * Normalize Claude CLI events to ProviderMessage format
   */
  normalizeEvent(event: unknown): ProviderMessage | null {
    const claudeEvent = event as ClaudeStreamEvent;

    switch (claudeEvent.type) {
      case 'system':
        // System init - capture session info but don't yield
        return null;

      case 'assistant': {
        const assistantEvent = claudeEvent as ClaudeAssistantEvent;
        const content: ContentBlock[] = [];

        for (const block of assistantEvent.message.content) {
          if (block.type === 'text' && block.text) {
            content.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use' && block.name) {
            content.push({
              type: 'tool_use',
              name: block.name,
              tool_use_id: block.tool_use_id || `tool_${Date.now()}`,
              input: block.input || {},
            });
          } else if (block.type === 'tool_result' && block.tool_use_id) {
            content.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: block.content || '',
            });
          }
        }

        if (content.length === 0) {
          return null;
        }

        return {
          type: 'assistant',
          session_id: assistantEvent.session_id,
          message: {
            role: 'assistant',
            content,
          },
        };
      }

      case 'result': {
        const resultEvent = claudeEvent as ClaudeResultEvent;

        if (resultEvent.is_error) {
          return {
            type: 'error',
            session_id: resultEvent.session_id,
            error: resultEvent.error || resultEvent.result || 'Unknown error',
          };
        }

        return {
          type: 'result',
          subtype: 'success',
          session_id: resultEvent.session_id,
          result: resultEvent.result,
        };
      }

      default:
        return null;
    }
  }

  // ==========================================================================
  // CliProvider Overrides
  // ==========================================================================

  /**
   * Override error mapping for Claude Chrome-specific errors
   */
  protected mapError(stderr: string, exitCode: number | null): CliErrorInfo {
    const lower = stderr.toLowerCase();

    if (
      lower.includes('not authenticated') ||
      lower.includes('please log in') ||
      lower.includes('unauthorized')
    ) {
      return {
        code: ClaudeChromeErrorCode.NOT_AUTHENTICATED,
        message: 'Claude CLI is not authenticated',
        recoverable: true,
        suggestion: 'Run "claude login" to authenticate',
      };
    }

    if (
      lower.includes('chrome extension') ||
      lower.includes('extension not connected') ||
      lower.includes('chrome not connected')
    ) {
      return {
        code: ClaudeChromeErrorCode.CHROME_NOT_CONNECTED,
        message: 'Chrome extension is not connected',
        recoverable: true,
        suggestion: 'Install and connect the Claude Chrome extension',
      };
    }

    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('429')
    ) {
      return {
        code: ClaudeChromeErrorCode.RATE_LIMITED,
        message: 'API rate limit exceeded',
        recoverable: true,
        suggestion: 'Wait a few minutes and try again',
      };
    }

    if (
      lower.includes('network') ||
      lower.includes('connection') ||
      lower.includes('econnrefused') ||
      lower.includes('timeout')
    ) {
      return {
        code: ClaudeChromeErrorCode.NETWORK_ERROR,
        message: 'Network connection error',
        recoverable: true,
        suggestion: 'Check your internet connection and try again',
      };
    }

    if (exitCode === 137 || lower.includes('killed') || lower.includes('sigterm')) {
      return {
        code: ClaudeChromeErrorCode.PROCESS_CRASHED,
        message: 'Claude process was terminated',
        recoverable: true,
        suggestion: 'The process may have run out of memory. Try a simpler task.',
      };
    }

    return {
      code: ClaudeChromeErrorCode.UNKNOWN,
      message: stderr || `Claude exited with code ${exitCode}`,
      recoverable: false,
    };
  }

  /**
   * Override install instructions
   */
  protected getInstallInstructions(): string {
    return 'Install Claude CLI from https://claude.ai/code';
  }

  /**
   * Execute query using Claude CLI with Chrome integration
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    this.ensureCliDetected();

    if (!this.cliPath) {
      throw this.createError(
        ClaudeChromeErrorCode.NOT_INSTALLED,
        'Claude CLI is not installed',
        true,
        this.getInstallInstructions()
      );
    }

    // Extract prompt text for stdin
    const promptText = this.extractPromptText(options);

    const cliArgs = this.buildCliArgs(options);
    const subprocessOptions = this.buildSubprocessOptions(options, cliArgs);

    // Pass prompt via stdin
    subprocessOptions.stdinData = promptText;

    let sessionId: string | undefined;

    logger.debug(`ClaudeChromeProvider.executeQuery called with model: "${options.model}"`);
    logger.debug(`CLI args: ${cliArgs.join(' ')}`);

    try {
      for await (const rawEvent of spawnJSONLProcess(subprocessOptions)) {
        const event = rawEvent as ClaudeStreamEvent;

        // Capture session ID from system init
        if (event.type === 'system' && (event as ClaudeSystemEvent).subtype === 'init') {
          sessionId = event.session_id;
          logger.debug(`Session started: ${sessionId}`);
        }

        // Normalize and yield
        const normalized = this.normalizeEvent(event);
        if (normalized) {
          if (!normalized.session_id && sessionId) {
            normalized.session_id = sessionId;
          }
          yield normalized;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        logger.debug('Query aborted');
        return;
      }

      // Map CLI errors
      if (error instanceof Error && 'stderr' in error) {
        const errorInfo = this.mapError(
          (error as { stderr?: string }).stderr || error.message,
          (error as { exitCode?: number | null }).exitCode ?? null
        );
        throw this.createError(
          errorInfo.code as ClaudeChromeErrorCode,
          errorInfo.message,
          errorInfo.recoverable,
          errorInfo.suggestion
        );
      }
      throw error;
    }
  }

  // ==========================================================================
  // Provider-Specific Methods
  // ==========================================================================

  private createError(
    code: ClaudeChromeErrorCode,
    message: string,
    recoverable: boolean = false,
    suggestion?: string
  ): ClaudeChromeError {
    const error = new Error(message) as ClaudeChromeError;
    error.code = code;
    error.recoverable = recoverable;
    error.suggestion = suggestion;
    error.name = 'ClaudeChromeError';
    return error;
  }

  /**
   * Detect installation status
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const installed = await this.isInstalled();

    return {
      installed,
      path: this.cliPath || undefined,
      method: 'cli',
      authenticated: installed, // Assume authenticated if CLI is installed
    };
  }

  /**
   * Get available Chrome-enabled models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'claude-sonnet-4-20250514-chrome',
        name: 'Claude Sonnet 4 (Chrome)',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'claude-chrome',
        description: 'Claude Sonnet 4 with Chrome browser integration',
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-5-20251101-chrome',
        name: 'Claude Opus 4.5 (Chrome)',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'claude-chrome',
        description: 'Claude Opus 4.5 with Chrome browser integration',
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-haiku-4-5-20251001-chrome',
        name: 'Claude Haiku 4.5 (Chrome)',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'claude-chrome',
        description: 'Claude Haiku 4.5 with Chrome browser integration',
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  /**
   * Check if feature is supported
   */
  supportsFeature(feature: string): boolean {
    const supported = ['tools', 'text', 'streaming', 'vision', 'chrome'];
    return supported.includes(feature);
  }
}
