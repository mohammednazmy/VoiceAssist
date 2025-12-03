/**
 * Tool Call Handler
 *
 * Manages safe interruption of tool calls during barge-in events.
 * Handles critical operations, rollbacks, and queued interruptions.
 *
 * Phase 10: Advanced Conversation Management
 */

import type {
  ToolCallState,
  ToolCallStatus,
  InterruptionResult,
  BargeInEvent,
} from "./types";
import { CRITICAL_TOOLS, SAFE_TO_CANCEL_TOOLS } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Pending interruption entry
 */
interface PendingInterruption {
  bargeIn: BargeInEvent;
  toolCallId: string;
  queuedAt: number;
}

/**
 * Tool call handler configuration
 */
export interface ToolCallHandlerConfig {
  /** Maximum time to wait for critical operations (ms) */
  maxWaitTime: number;

  /** Enable automatic rollback */
  enableAutoRollback: boolean;

  /** Maximum pending interruptions */
  maxPendingInterruptions: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ToolCallHandlerConfig = {
  maxWaitTime: 10000,
  enableAutoRollback: true,
  maxPendingInterruptions: 5,
};

// ============================================================================
// Tool Call Handler
// ============================================================================

/**
 * Handles tool call interruptions during barge-in events
 */
export class ToolCallHandler {
  private config: ToolCallHandlerConfig;

  /** Active tool calls */
  private activeToolCalls: Map<string, ToolCallState> = new Map();

  /** Pending interruptions for critical tools */
  private pendingInterruptions: PendingInterruption[] = [];

  /** Tool call history for analysis */
  private completedToolCalls: ToolCallState[] = [];
  private readonly maxHistorySize = 50;

  constructor(config: Partial<ToolCallHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Tool Call Registration
  // ==========================================================================

  /**
   * Register a new tool call
   */
  registerToolCall(
    id: string,
    name: string,
    options: {
      safeToInterrupt?: boolean;
      rollbackAction?: () => Promise<void>;
      estimatedDuration?: number;
    } = {},
  ): ToolCallState {
    const toolCall: ToolCallState = {
      id,
      name,
      status: "pending",
      safeToInterrupt:
        options.safeToInterrupt ?? this.inferSafeToInterrupt(name),
      rollbackAction: options.rollbackAction,
      startedAt: Date.now(),
      estimatedDuration: options.estimatedDuration,
      progress: 0,
    };

    this.activeToolCalls.set(id, toolCall);
    return toolCall;
  }

  /**
   * Update tool call status
   */
  updateStatus(id: string, status: ToolCallStatus, progress?: number): void {
    const toolCall = this.activeToolCalls.get(id);

    if (toolCall) {
      toolCall.status = status;

      if (progress !== undefined) {
        toolCall.progress = progress;
      }

      // Move to history if completed
      if (this.isTerminalStatus(status)) {
        this.activeToolCalls.delete(id);
        this.addToHistory(toolCall);

        // Process pending interruptions
        this.processPendingInterruptions(id);
      }
    }
  }

  /**
   * Get tool call by ID
   */
  getToolCall(id: string): ToolCallState | undefined {
    return this.activeToolCalls.get(id);
  }

  /**
   * Get all active tool calls
   */
  getActiveToolCalls(): ToolCallState[] {
    return Array.from(this.activeToolCalls.values());
  }

  // ==========================================================================
  // Interruption Handling
  // ==========================================================================

  /**
   * Handle a barge-in interruption for a tool call
   */
  handleInterruption(
    toolCall: ToolCallState,
    bargeIn: BargeInEvent,
  ): InterruptionResult {
    // Check if tool is in critical list
    const isCritical = this.isCriticalTool(toolCall.name);

    // Check if explicitly marked safe to interrupt
    if (toolCall.safeToInterrupt) {
      return {
        canInterrupt: true,
        action: "cancel",
      };
    }

    // Check if in safe-to-cancel list
    if (this.isSafeToCancel(toolCall.name)) {
      return {
        canInterrupt: true,
        action: "cancel",
      };
    }

    // Critical tool: queue interruption
    if (isCritical) {
      return this.queueInterruption(toolCall, bargeIn);
    }

    // Check if rollback is available
    if (toolCall.rollbackAction && this.config.enableAutoRollback) {
      return {
        canInterrupt: true,
        action: "rollback",
      };
    }

    // Default: allow but log warning
    console.warn(
      `[ToolCallHandler] Interrupting unclassified tool: ${toolCall.name}`,
    );
    return {
      canInterrupt: true,
      action: "cancel",
    };
  }

  /**
   * Queue interruption for critical tool
   */
  private queueInterruption(
    toolCall: ToolCallState,
    bargeIn: BargeInEvent,
  ): InterruptionResult {
    // Add to pending
    this.pendingInterruptions.push({
      bargeIn,
      toolCallId: toolCall.id,
      queuedAt: Date.now(),
    });

    // Limit pending interruptions
    while (
      this.pendingInterruptions.length > this.config.maxPendingInterruptions
    ) {
      this.pendingInterruptions.shift();
    }

    // Estimate wait time
    const elapsed = Date.now() - toolCall.startedAt;
    const estimatedWait = toolCall.estimatedDuration
      ? Math.max(0, toolCall.estimatedDuration - elapsed)
      : this.config.maxWaitTime;

    return {
      canInterrupt: false,
      action: "queue",
      userMessage: this.getWaitMessage(toolCall.name, estimatedWait),
      estimatedWaitMs: estimatedWait,
    };
  }

  /**
   * Process pending interruptions after tool completes
   */
  private processPendingInterruptions(toolCallId: string): void {
    const pending = this.pendingInterruptions.filter(
      (p) => p.toolCallId === toolCallId,
    );

    if (pending.length > 0) {
      // Remove processed interruptions
      this.pendingInterruptions = this.pendingInterruptions.filter(
        (p) => p.toolCallId !== toolCallId,
      );

      // Log for debugging
      console.debug(
        `[ToolCallHandler] Processing ${pending.length} pending interruptions for ${toolCallId}`,
      );
    }
  }

  /**
   * Get pending interruptions for a tool call
   */
  getPendingInterruptions(toolCallId?: string): PendingInterruption[] {
    if (toolCallId) {
      return this.pendingInterruptions.filter(
        (p) => p.toolCallId === toolCallId,
      );
    }
    return [...this.pendingInterruptions];
  }

  /**
   * Clear pending interruption and return the barge-in event
   */
  clearPendingInterruption(toolCallId: string): BargeInEvent | null {
    const index = this.pendingInterruptions.findIndex(
      (p) => p.toolCallId === toolCallId,
    );

    if (index >= 0) {
      const [removed] = this.pendingInterruptions.splice(index, 1);
      return removed.bargeIn;
    }

    return null;
  }

  // ==========================================================================
  // Rollback
  // ==========================================================================

  /**
   * Execute rollback for a tool call
   */
  async executeRollback(toolCall: ToolCallState): Promise<boolean> {
    if (!toolCall.rollbackAction) {
      console.warn(`[ToolCallHandler] No rollback action for ${toolCall.id}`);
      return false;
    }

    try {
      await toolCall.rollbackAction();
      this.updateStatus(toolCall.id, "rolled_back");
      return true;
    } catch (error) {
      console.error(
        `[ToolCallHandler] Rollback failed for ${toolCall.id}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Cancel a tool call (if possible)
   */
  async cancelToolCall(id: string): Promise<boolean> {
    const toolCall = this.activeToolCalls.get(id);

    if (!toolCall) {
      return false;
    }

    if (!toolCall.safeToInterrupt && this.isCriticalTool(toolCall.name)) {
      console.warn(
        `[ToolCallHandler] Cannot cancel critical tool: ${toolCall.name}`,
      );
      return false;
    }

    // If has rollback, execute it
    if (toolCall.rollbackAction && this.config.enableAutoRollback) {
      return this.executeRollback(toolCall);
    }

    // Otherwise just mark as cancelled
    this.updateStatus(id, "cancelled");
    return true;
  }

  // ==========================================================================
  // Tool Classification
  // ==========================================================================

  /**
   * Check if tool is critical
   */
  private isCriticalTool(name: string): boolean {
    const lowerName = name.toLowerCase();
    return CRITICAL_TOOLS.some((t) => lowerName.includes(t));
  }

  /**
   * Check if tool is safe to cancel
   */
  private isSafeToCancel(name: string): boolean {
    const lowerName = name.toLowerCase();
    return SAFE_TO_CANCEL_TOOLS.some((t) => lowerName.includes(t));
  }

  /**
   * Infer if tool is safe to interrupt from name
   */
  private inferSafeToInterrupt(name: string): boolean {
    if (this.isCriticalTool(name)) return false;
    if (this.isSafeToCancel(name)) return true;
    return true; // Default to safe
  }

  /**
   * Get user-friendly wait message
   */
  private getWaitMessage(toolName: string, estimatedWaitMs: number): string {
    const seconds = Math.ceil(estimatedWaitMs / 1000);

    // Make tool name readable
    const readableName = toolName
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .toLowerCase()
      .trim();

    if (seconds <= 2) {
      return `One moment, just finishing ${readableName}.`;
    }

    if (seconds <= 5) {
      return `Please hold on, I'm completing ${readableName}. I'll be right with you.`;
    }

    return `I'm in the middle of ${readableName}. This will take about ${seconds} seconds. Please wait.`;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Check if status is terminal
   */
  private isTerminalStatus(status: ToolCallStatus): boolean {
    return ["completed", "cancelled", "rolled_back", "failed"].includes(status);
  }

  /**
   * Add completed tool call to history
   */
  private addToHistory(toolCall: ToolCallState): void {
    this.completedToolCalls.push(toolCall);

    if (this.completedToolCalls.length > this.maxHistorySize) {
      this.completedToolCalls.shift();
    }
  }

  /**
   * Get tool call statistics
   */
  getStats(): {
    activeCount: number;
    pendingInterruptions: number;
    completedCount: number;
    cancelledCount: number;
    rolledBackCount: number;
  } {
    const completed = this.completedToolCalls.filter(
      (tc) => tc.status === "completed",
    );
    const cancelled = this.completedToolCalls.filter(
      (tc) => tc.status === "cancelled",
    );
    const rolledBack = this.completedToolCalls.filter(
      (tc) => tc.status === "rolled_back",
    );

    return {
      activeCount: this.activeToolCalls.size,
      pendingInterruptions: this.pendingInterruptions.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      rolledBackCount: rolledBack.length,
    };
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.activeToolCalls.clear();
    this.pendingInterruptions = [];
    this.completedToolCalls = [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new tool call handler
 */
export function createToolCallHandler(
  config?: Partial<ToolCallHandlerConfig>,
): ToolCallHandler {
  return new ToolCallHandler(config);
}
