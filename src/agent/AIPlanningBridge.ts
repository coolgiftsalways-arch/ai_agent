
import path from "node:path";
import type { Message, Tool } from "ollama";

import { Planner } from "./Planner.js";
import { TaskContext } from "./TaskContext.js";
import { TaskRunner } from "./TaskRunner.js";
import { Executor } from "./Executor.js";

import { formatFileResult } from "./FileResultFormatter.js";

import {
  allAgentTools,
} from "../tools/AgentToolRouter.js";

/**
 * NEXA - AI Planning Bridge
 *
 * Responsibilities:
 * - Connect the AI Planner to the TaskRunner.
 * - Return conversational decisions directly.
 * - Preserve clarification state.
 * - Validate filesystem path grounding.
 * - Delegate unsupported capabilities to
 *   existing NEXA workflows.
 *
 * No natural-language keyword matching.
 * No sentence-based command routing.
 * No direct filesystem execution.
 */

const ENABLED_TOOLS = new Set<string>([
  "file_list_files",
  "file_read_file",
  "file_exists",
]);

/**
 * Protocol tool, not a user command.
 *
 * Allows the AI to select the existing
 * NEXA workflow for capabilities that
 * have not yet migrated to TaskRunner.
 */
const DELEGATE_NAME =
  "nexa_delegate_to_existing_agent";

const delegateTool: Tool = {
  type: "function",
  function: {
    name: DELEGATE_NAME,
    description:
      "Use the existing NEXA workflow when the user's requested capability cannot be fulfilled using the other available tools.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

function canonicalPath(
  value: string
): string | null {
  if (!value.trim()) {
    return null;
  }

  const candidate = value.trim();

  if (
    candidate.includes("\0") ||
    /[\x01-\x1f"<>|?*]/.test(candidate) ||
    candidate.split(/[\\/]/).includes("..")
  ) {
    return null;
  }

  const normalized = path.win32.normalize(
    candidate.replace(/\//g, "\\")
  );

  if (
    !path.win32.isAbsolute(normalized) ||
    !/^[a-zA-Z]:\\/.test(normalized) ||
    normalized.slice(2).includes(":")
  ) {
    return null;
  }

  return normalized;
}

function samePath(
  first: string,
  second: string
): boolean {
  const left = canonicalPath(first);
  const right = canonicalPath(second);

  return (
    left !== null &&
    right !== null &&
    left.toLowerCase() === right.toLowerCase()
  );
}

/**
 * Check whether a selected path has
 * support from the current request
 * or previously verified task context.
 *
 * This does not replace FileTool's
 * actual filesystem security checks.
 */
function isGroundedPath(
  target: string,
  instruction: string,
  context: TaskContext
): boolean {
  const normalized = canonicalPath(target);

  if (!normalized) {
    return false;
  }

  const comparableInstruction =
    instruction
      .replace(/\//g, "\\")
      .toLowerCase();

  const normalizedTarget =
    normalized.toLowerCase();

  // The complete path was provided by user.
  if (
    comparableInstruction.includes(
      normalizedTarget
    )
  ) {
    return true;
  }

  const snapshot = context.getSnapshot();

  // The exact location was verified earlier.
  const verified = snapshot.facts.some(
    (fact) =>
      fact.source === "tool" &&
      samePath(fact.value, normalized)
  );

  if (verified) {
    return true;
  }

  /**
   * Resolve a child of a verified directory
   * only when the user supplied its name.
   *
   * This is path grounding, not sentence
   * interpretation.
   */
  const currentDirectory =
    context.getFact("currentDirectory");

  if (
    currentDirectory?.source === "tool"
  ) {
    const parent = path.win32.dirname(
      normalized
    );

    const basename = path.win32.basename(
      normalized
    );

    if (
      samePath(
        parent,
        currentDirectory.value
      ) &&
      comparableInstruction.includes(
        basename.toLowerCase()
      )
    ) {
      return true;
    }
  }

  return false;
}

export class AIPlanningBridge {
  private readonly planner = new Planner();

  private readonly context =
    new TaskContext();

  private readonly availableTools: Tool[];

  private readonly planningTools: Tool[];

  private readonly runner: TaskRunner;

  constructor(
    private readonly executor: Executor
  ) {
    /**
     * Select permitted tools using the
     * existing tool registry.
     *
     * Tool names here are capability
     * permissions, not language patterns.
     */
    this.availableTools =
      allAgentTools.filter(
        (tool) =>
          typeof tool.function.name ===
            "string" &&
          ENABLED_TOOLS.has(
            tool.function.name
          )
      );

    this.planningTools = [
      ...this.availableTools,
      delegateTool,
    ];

    this.runner = new TaskRunner(
      this.executor,
      this.context,
      this.availableTools
    );
  }

  async handle(
    instruction: string,
    history: Message[]
  ): Promise<string | null> {
    const userInstruction =
      instruction.trim();

    if (!userInstruction) {
      return "What would you like me to do?";
    }

    /**
     * The caller has already appended
     * the latest user message.
     *
     * Avoid submitting it twice.
     */
    const previousHistory =
      history.slice(0, -1);

    const decision =
      await this.planner.plan({
        instruction: userInstruction,
        history: previousHistory,
        tools: this.planningTools,
        taskContext:
          this.context.getContextForPlanner(),
      });

    console.log(
      `[AIPlanningBridge] Decision: ${decision.kind}`
    );

    /**
     * An invalid planning response is a
     * failure, not permission to invent a
     * result or execute another task.
     */
    if (decision.kind === "error") {
      return (
        "AI planning could not be completed: " +
        decision.message
      );
    }

    /**
     * Handle clarification immediately.
     * Preserve it for the next user turn.
     */
    if (
      decision.kind === "clarification"
    ) {
      this.context.requestClarification(
        decision.question
      );

      return decision.question;
    }

    /**
     * Ordinary conversation does not
     * require TaskRunner or another
     * Ollama request.
     */
    if (decision.kind === "response") {
      this.context.resumeAfterClarification();

      return decision.message;
    }

    /**
     * Explicit model-selected delegation.
     *
     * Existing workflows remain responsible
     * for features not migrated to the
     * central TaskRunner yet.
     */
    const delegated =
      decision.steps.some(
        (step) =>
          step.toolName === DELEGATE_NAME
      );

    if (delegated) {
      if (
        decision.steps.length !== 1
      ) {
        return (
          "The AI proposed a mixed task " +
          "that cannot be executed safely."
        );
      }

      this.context.resumeAfterClarification();

      console.log(
        "[AIPlanningBridge] Delegating to existing agent."
      );

      return null;
    }

    /**
     * Validate proposed file destinations
     * before running any operation.
     *
     * This is separate from ordinary
     * tool-argument validation.
     */
    for (const step of decision.steps) {
      if (
        !ENABLED_TOOLS.has(
          step.toolName
        )
      ) {
        return (
          "The proposed tool is not " +
          "enabled for this workflow."
        );
      }

      const target =
        step.arguments.path;

      if (
        typeof target !== "string"
      ) {
        const question =
          "Which file or folder path should I use?";

        this.context.requestClarification(
          question
        );

        return question;
      }

      const normalized =
        canonicalPath(target);

      if (!normalized) {
        const question =
          "Please provide a valid absolute Windows path.";

        this.context.requestClarification(
          question
        );

        return question;
      }

      if (
        !isGroundedPath(
          normalized,
          userInstruction,
          this.context
        )
      ) {
        const question =
          `Please confirm the location: ${normalized}`;

        this.context.requestClarification(
          question
        );

        return question;
      }
    }

    /**
     * TaskRunner validates and executes
     * through the registered Executor.
     *
     * Executor still checks permissions.
     */
    const outcome =
      await this.runner.run(
        decision,
        {
          allowedToolNames:
            ENABLED_TOOLS,
        }
      );

    if (!outcome.success) {
      return outcome.message;
    }

    /**
     * Format actual tool results.
     *
     * Do not call the model again just
     * to explain a basic tool response.
     */
    const answers: string[] = [];

    for (
      const result of outcome.results
    ) {
      answers.push(
        formatFileResult(
          result.toolName,
          {
            success: result.success,
            message: result.message,
            data: result.data,
          }
        )
      );

      const plannedStep =
        decision.steps.find(
          (step) =>
            step.id === result.stepId
        );

      const target =
        plannedStep?.arguments.path;

      if (
        typeof target !== "string"
      ) {
        continue;
      }

      const normalized =
        canonicalPath(target);

      if (!normalized) {
        continue;
      }

      const data = result.data;

      const confirmedExists =
        result.toolName !==
          "file_exists" ||
        (
          data !== null &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          (data as {
            exists?: unknown;
          }).exists === true
        );

      if (!confirmedExists) {
        continue;
      }

      this.context.setFact(
        "lastVerifiedPath",
        normalized,
        "tool"
      );

      if (
        result.toolName ===
        "file_list_files"
      ) {
        this.context.setFact(
          "currentDirectory",
          normalized,
          "tool"
        );
      }
    }

    return answers.join("\n\n");
  }
}
