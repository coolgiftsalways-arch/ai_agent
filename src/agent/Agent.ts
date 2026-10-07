import type { Message } from "ollama";

import {
  askOllama,
} from "../ollama/OllamaClient.js";

import {
  FileTool,
} from "../tools/FileTool.js";

import {
  TerminalTool,
} from "../tools/TerminalTool.js";

import {
  agentTools,
  mapNativeToolCall,
} from "../tools/NativeToolDefinitions.js";

import {
  buildSystemPrompt,
} from "../prompts/systemPrompt.js";

import {
  PermissionManager,
} from "../security/PermissionManager.js";

import {
  askForApproval,
} from "../security/ConsoleApproval.js";

import {
  Executor,
} from "./Executor.js";

export class Agent {
  private executor: Executor;

  /*
  ==========================================
  CONVERSATION MEMORY
  ==========================================
  */

  private messages: Message[];

  constructor() {
    /*
    ==========================================
    PERMISSION MANAGER
    ==========================================
    */

    const permissionManager =
      new PermissionManager(
        askForApproval
      );

    /*
    ==========================================
    EXECUTOR
    ==========================================
    */

    this.executor =
      new Executor(
        permissionManager
      );

    /*
    ==========================================
    FILE TOOL
    ==========================================
    */

    const fileTool =
      new FileTool([
        process.cwd(),
        "S:\\",
      ]);

    /*
    ==========================================
    TERMINAL TOOL
    ==========================================
    */

    const terminalTool =
      new TerminalTool([
        process.cwd(),
        "S:\\",
      ]);

    /*
    ==========================================
    REGISTER TOOLS
    ==========================================
    */

    this.executor.registerTool(
      fileTool
    );

    this.executor.registerTool(
      terminalTool
    );

    /*
    ==========================================
    START ONE CONTINUOUS CONVERSATION
    ==========================================
    */

    this.messages = [
      {
        role: "system",
        content:
          buildSystemPrompt(),
      },
    ];
  }

  /*
  ==========================================
  RUN USER TASK
  ==========================================
  */

  async run(
    userInput: string
  ): Promise<string> {
    /*
    ------------------------------------------
    ADD THE NEW USER MESSAGE
    ------------------------------------------
    */

    this.messages.push({
      role: "user",
      content: userInput,
    });

    const MAX_STEPS = 30;

    /*
    If a tool fails, don't allow the model
    to immediately pretend the task worked.
    */

    let unresolvedToolFailure =
      false;

    let failureReminderCount =
      0;

    /*
    ==========================================
    AGENT LOOP
    ==========================================
    */

    for (
      let step = 1;
      step <= MAX_STEPS;
      step++
    ) {
      console.log(
        `\n🧠 Agent step ${step}/${MAX_STEPS}`
      );

      console.log(
        "Thinking..."
      );

      /*
      ----------------------------------------
      ASK OLLAMA
      ----------------------------------------
      */

      const response =
        await askOllama(
          this.messages,
          agentTools
        );

      const assistantMessage =
        response.message;

      /*
      Save what the model said/called.
      This is VERY IMPORTANT for memory.
      */

      this.messages.push(
        assistantMessage
      );

      const toolCalls =
        assistantMessage.tool_calls ??
        [];

      /*
      ========================================
      NO TOOL CALL = POSSIBLE FINAL ANSWER
      ========================================
      */

      if (
        toolCalls.length === 0
      ) {
        /*
        A tool failed earlier.

        Do NOT allow the model to simply
        claim success.
        */

        if (
          unresolvedToolFailure &&
          failureReminderCount < 2
        ) {
          this.messages.push({
            role: "user",

            content: `
A required tool action in the current task failed.

Do NOT claim that the task succeeded.

Review the previous tool error.

If you can safely correct the problem,
use the appropriate tool.

If the task cannot be completed,
clearly tell the user that it failed.

Never invent a successful result.
`,
          });

          failureReminderCount++;

          continue;
        }

        const answer =
          assistantMessage
            .content
            ?.trim();

        if (answer) {
          return answer;
        }

        return "Task completed.";
      }

      /*
      ========================================
      EXECUTE TOOL CALLS
      ========================================
      */

      let currentBatchFailed =
        false;

      let currentBatchSucceeded =
        false;

      for (
        const toolCall
        of toolCalls
      ) {
        const toolName =
          toolCall.function.name;

        const args =
          toolCall.function
            .arguments as Record<
              string,
              unknown
            >;

        console.log(
          `\n🔧 Native tool call: ${toolName}`
        );

        console.log(
          "Arguments:",
          args
        );

        /*
        --------------------------------------
        MAP NATIVE TOOL
        --------------------------------------
        */

        const request =
          mapNativeToolCall(
            toolName,
            args
          );

        /*
        --------------------------------------
        UNKNOWN TOOL
        --------------------------------------
        */

        if (!request) {
          const errorResult = {
            success: false,

            message:
              `Unknown tool: ${toolName}`,
          };

          currentBatchFailed =
            true;

          this.messages.push({
            role: "tool",

            tool_name:
              toolName,

            content:
              JSON.stringify(
                errorResult
              ),
          });

          continue;
        }

        /*
        --------------------------------------
        EXECUTE TOOL
        --------------------------------------
        */

        const result =
          await this.executor.execute(
            request
          );

        console.log(
          "\n🔧 Tool result:"
        );

        console.log(
          result
        );

        /*
        --------------------------------------
        TRACK SUCCESS / FAILURE
        --------------------------------------
        */

        if (result.success) {
          currentBatchSucceeded =
            true;
        } else {
          currentBatchFailed =
            true;
        }

        /*
        --------------------------------------
        SAVE TOOL RESULT IN MEMORY
        --------------------------------------
        */

        this.messages.push({
          role: "tool",

          tool_name:
            toolName,

          content:
            JSON.stringify(
              result
            ),
        });
      }

      /*
      ========================================
      UPDATE FAILURE STATE
      ========================================
      */

      if (
        currentBatchFailed
      ) {
        unresolvedToolFailure =
          true;
      } else if (
        currentBatchSucceeded
      ) {
        unresolvedToolFailure =
          false;

        failureReminderCount =
          0;
      }
    }

    return (
      "The agent stopped because " +
      "the maximum number of steps was reached."
    );
  }

  /*
  ==========================================
  CLEAR SHORT-TERM MEMORY
  ==========================================
  */

  resetConversation() {
    this.messages = [
      {
        role: "system",

        content:
          buildSystemPrompt(),
      },
    ];

    console.log(
      "🧠 Conversation memory cleared."
    );
  }
}