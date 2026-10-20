
/**
 * NEXA - Task Context Manager
 *
 * Stores context for the current conversation.
 *
 * AI interprets language.
 * TaskContext stores verified facts.
 *
 * No sentence matching.
 * No tool execution.
 * No filesystem modifications.
 */

export type TaskStatus =
  | "idle"
  | "planning"
  | "awaiting_clarification"
  | "executing"
  | "completed"
  | "failed";

export type TaskFact = {
  key: string;
  value: string;
  source: "user" | "tool";
  updatedAt: number;
};

export type TaskStepResult = {
  stepId: string;
  toolName: string;
  success: boolean;
  message: string;
  timestamp: number;
};

export type TaskSnapshot = {
  status: TaskStatus;
  goal: string | null;
  pendingQuestion: string | null;
  facts: TaskFact[];
  steps: TaskStepResult[];
};

const MAX_FACTS = 30;
const MAX_STEPS = 50;
const MAX_VALUE_LENGTH = 2048;
const MAX_MESSAGE_LENGTH = 500;

function limitText(
  value: string,
  maximum: number
): string {
  return value.trim().slice(0, maximum);
}

export class TaskContext {
  private status: TaskStatus = "idle";

  private goal: string | null = null;

  private pendingQuestion: string | null = null;

  private facts = new Map<string, TaskFact>();

  private steps: TaskStepResult[] = [];

  /**
   * Start a new task.
   *
   * Preserve verified conversation facts so the
   * user can refer to previously accessed paths.
   */
  startTask(goal: string): void {
    this.goal = limitText(goal, 1000);
    this.status = "planning";
    this.pendingQuestion = null;
    this.steps = [];
  }

  /**
   * Store a fact from the user's explicit input
   * or from a successful, verified tool result.
   *
   * AI-generated guesses should NOT be stored
   * as verified facts.
   */
  setFact(
    key: string,
    value: string,
    source: "user" | "tool"
  ): void {
    const safeKey = limitText(key, 100);
    const safeValue = limitText(
      value,
      MAX_VALUE_LENGTH
    );

    if (!safeKey || !safeValue) {
      return;
    }

    // Reinsert to maintain recent-use ordering.
    this.facts.delete(safeKey);

    this.facts.set(safeKey, {
      key: safeKey,
      value: safeValue,
      source,
      updatedAt: Date.now(),
    });

    while (this.facts.size > MAX_FACTS) {
      const oldest = this.facts.keys().next();

      if (oldest.done) break;

      this.facts.delete(oldest.value);
    }
  }

  getFact(key: string): TaskFact | null {
    return this.facts.get(key) ?? null;
  }

  /**
   * Store a clarification question.
   *
   * The next user response will be sent to AI
   * together with this task context.
   */
  requestClarification(question: string): void {
    const safeQuestion = limitText(
      question,
      1000
    );

    if (!safeQuestion) return;

    this.pendingQuestion = safeQuestion;
    this.status = "awaiting_clarification";
  }

  hasPendingClarification(): boolean {
    return (
      this.status === "awaiting_clarification" &&
      this.pendingQuestion !== null
    );
  }

  /**
   * A reply supplies information to the AI
   * planner; it does not automatically authorize
   * the execution of a previously proposed plan.
   */
  resumeAfterClarification(): void {
    if (!this.hasPendingClarification()) {
      return;
    }

    this.pendingQuestion = null;
    this.status = "planning";
  }

  setExecuting(): void {
    this.status = "executing";
  }

  /**
   * Record real execution results, not
   * predicted or AI-invented results.
   */
  recordStep(
    stepId: string,
    toolName: string,
    success: boolean,
    message: string
  ): void {
    this.steps.push({
      stepId: limitText(stepId, 100),
      toolName: limitText(toolName, 100),
      success,
      message: limitText(
        message,
        MAX_MESSAGE_LENGTH
      ),
      timestamp: Date.now(),
    });

    if (this.steps.length > MAX_STEPS) {
      this.steps = this.steps.slice(-MAX_STEPS);
    }
  }

  completeTask(): void {
    this.status = "completed";
    this.pendingQuestion = null;
  }

  failTask(): void {
    this.status = "failed";
  }

  getStatus(): TaskStatus {
    return this.status;
  }

  getSnapshot(): TaskSnapshot {
    return {
      status: this.status,
      goal: this.goal,
      pendingQuestion: this.pendingQuestion,
      facts: Array.from(this.facts.values()).map(
        (fact) => ({ ...fact })
      ),
      steps: this.steps.map(
        (step) => ({ ...step })
      ),
    };
  }

  /**
   * Build compact context for the AI planner.
   *
   * This contains state, not arbitrary file
   * contents, passwords, tokens, or emails.
   */
  getContextForPlanner(): string {
    const snapshot = this.getSnapshot();

    const context = {
      currentTask: snapshot.goal,
      status: snapshot.status,
      pendingQuestion: snapshot.pendingQuestion,

      knownFacts: snapshot.facts.map(
        (fact) => ({
          key: fact.key,
          value: fact.value,
          source: fact.source,
        })
      ),

      recentSteps: snapshot.steps
        .slice(-10)
        .map((step) => ({
          stepId: step.stepId,
          toolName: step.toolName,
          success: step.success,
          message: step.message,
        })),
    };

    return JSON.stringify(context);
  }

  /**
   * Clear task state and conversation facts.
   * Does not alter long-term memory.
   */
  reset(): void {
    this.status = "idle";
    this.goal = null;
    this.pendingQuestion = null;
    this.facts.clear();
    this.steps = [];
  }
}
