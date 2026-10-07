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
  MemoryManager,
} from "../memory/MemoryManager.js";

import {
  Executor,
} from "./Executor.js";

export class Agent {
  private executor: Executor;

  /*
  ==========================================
  SHORT-TERM CONVERSATION MEMORY
  ==========================================
  */

  private messages: Message[];

  /*
  ==========================================
  LONG-TERM SQLITE MEMORY
  ==========================================
  */

  private memoryManager: MemoryManager;

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
    LONG-TERM MEMORY
    ==========================================
    */

    this.memoryManager =
      new MemoryManager();

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
    START SHORT-TERM CONVERSATION
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
    ==========================================
    SEARCH LONG-TERM MEMORY
    ==========================================
    */

    const longTermMemory =
      this.memoryManager
        .getContextForPrompt(
          userInput
        );

    /*
    We use a separate message array for
    this task so long-term memory context
    doesn't permanently duplicate inside
    the short-term conversation.
    */

    const runMessages: Message[] = [
      ...this.messages,
    ];

    /*
    ==========================================
    ADD RELEVANT LONG-TERM MEMORY
    ==========================================
    */

    if (longTermMemory) {
      runMessages.push({
        role: "system",

        content: `
RELEVANT LONG-TERM MEMORY:

${longTermMemory}

Use this memory only when it is relevant
to the user's current request.

The newest user instruction always has
priority over old memory.

Old memory may describe something that
has changed.

Use tools to verify current computer
state whenever necessary.
`,
      });
    }

    /*
    ==========================================
    SAVE USER MESSAGE PERMANENTLY
    ==========================================
    */

    this.memoryManager.remember(
      "user",
      userInput
    );

    /*
    ==========================================
    ADD USER MESSAGE TO CURRENT SESSION
    ==========================================
    */

    const userMessage: Message = {
      role: "user",
      content: userInput,
    };

    this.messages.push(
      userMessage
    );

    runMessages.push(
      userMessage
    );

    const MAX_STEPS = 30;

    /*
    ==========================================
    FAILURE TRACKING
    ==========================================
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
      ========================================
      ASK QWEN THROUGH OLLAMA
      ========================================
      */

      const response =
        await askOllama(
          runMessages,
          agentTools
        );

      const assistantMessage =
        response.message;

      /*
      ========================================
      SAVE ASSISTANT MESSAGE
      ========================================
      */

      runMessages.push(
        assistantMessage
      );

      this.messages.push(
        assistantMessage
      );

      const toolCalls =
        assistantMessage.tool_calls ??
        [];

      /*
      ========================================
      NO TOOL CALL
      ========================================
      */

      if (
        toolCalls.length === 0
      ) {
        /*
        Prevent fake success after
        a failed tool action.
        */

        if (
          unresolvedToolFailure &&
          failureReminderCount < 2
        ) {
          runMessages.push({
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
          /*
          ====================================
          SAVE FINAL ANSWER PERMANENTLY
          ====================================
          */

          this.memoryManager.remember(
            "assistant",
            answer
          );

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
        ======================================
        MAP NATIVE TOOL
        ======================================
        */

        const request =
          mapNativeToolCall(
            toolName,
            args
          );

        /*
        ======================================
        UNKNOWN TOOL
        ======================================
        */

        if (!request) {
          const errorResult = {
            success: false,

            message:
              `Unknown tool: ${toolName}`,
          };

          currentBatchFailed =
            true;

          const toolMessage: Message = {
            role: "tool",

            tool_name:
              toolName,

            content:
              JSON.stringify(
                errorResult
              ),
          };

          runMessages.push(
            toolMessage
          );

          this.messages.push(
            toolMessage
          );

          continue;
        }

        /*
        ======================================
        EXECUTE REAL TOOL
        ======================================
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
        ======================================
        SAVE SUCCESSFUL TOOL RESULT
        TO SQLITE LONG-TERM MEMORY
        ======================================
        */

        this.memoryManager
          .rememberToolResult(
            toolName,
            result
          );

        /*
        ======================================
        TRACK SUCCESS / FAILURE
        ======================================
        */

        if (result.success) {
          currentBatchSucceeded =
            true;
        } else {
          currentBatchFailed =
            true;
        }

        /*
        ======================================
        SEND TOOL RESULT BACK TO QWEN
        ======================================
        */

        const toolMessage: Message = {
          role: "tool",

          tool_name:
            toolName,

          content:
            JSON.stringify(
              result
            ),
        };

        runMessages.push(
          toolMessage
        );

        this.messages.push(
          toolMessage
        );
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
  CLEAR SHORT-TERM MEMORY ONLY
  ==========================================
  */

  resetConversation(): void {
    this.messages = [
      {
        role: "system",

        content:
          buildSystemPrompt(),
      },
    ];

    console.log(
      "🧠 Short-term conversation memory cleared."
    );
  }
}