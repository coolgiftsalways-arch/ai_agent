import type {
  Message,
} from "ollama";

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
  validateNativeToolCall,
} from "../security/NativeToolValidator.js";

import {
  MemoryTool,
} from "../tools/MemoryTool.js";

import {
  MemoryManager,
} from "../memory/MemoryManager.js";

import {
  Executor,
} from "./Executor.js";


type ToolRequirement = {
  toolNames: string[];
  description: string;
};


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

    const memoryTool =
      new MemoryTool(
        this.memoryManager
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

    this.executor.registerTool(
      memoryTool
    );

    /*
    ==========================================
    START CONVERSATION
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
  DETECT REQUIRED TOOL
  ==========================================

  This is a code-level protection.

  If the user requests a real action,
  the model is not allowed to simply say
  that the action happened.
  */

  private getToolRequirement(
    userInput: string
  ): ToolRequirement | null {
    const text =
      userInput
        .trim()
        .toLowerCase();

    const containsFileExtension =
      /\.[a-z0-9]{1,10}\b/i.test(
        text
      );

    /*
    ==========================================
    MEMORY FORGET
    ==========================================
    */

    if (
      /\bforget\b/i.test(
        text
      ) &&
      /\bmemory\b/i.test(
        text
      )
    ) {
      /*
      If user already supplied an ID,
      memory_forget itself must succeed.
      */

      if (
        /\bmemory\s+(?:id\s*)?\d+\b/i.test(
          text
        ) ||
        /\bid\s*\d+\b/i.test(
          text
        )
      ) {
        return {
          toolNames: [
            "memory_forget",
          ],

          description:
            "memory_forget",
        };
      }

      /*
      If no ID is known yet, search is
      needed first. The model can then
      continue to memory_forget.
      */

      return {
        toolNames: [
          "memory_search",
          "memory_forget",
        ],

        description:
          "memory search followed by memory forget",
      };
    }

    /*
    ==========================================
    MEMORY REMEMBER
    ==========================================
    */

    if (
      /\bremember\b/i.test(
        text
      )
    ) {
      return {
        toolNames: [
          "memory_remember",
        ],

        description:
          "memory_remember",
      };
    }

    /*
    ==========================================
    MEMORY SEARCH
    ==========================================
    */

    if (
      (
        /\bsearch\b/i.test(
          text
        ) &&
        /\bmemory\b/i.test(
          text
        )
      ) ||
      /\bmemory id\b/i.test(
        text
      )
    ) {
      return {
        toolNames: [
          "memory_search",
        ],

        description:
          "memory_search",
      };
    }

    /*
    ==========================================
    RENAME
    ==========================================
    */

    if (
      /\brename\b/i.test(
        text
      )
    ) {
      return {
        toolNames: [
          "file_rename",
          "file_move",
        ],

        description:
          "file rename",
      };
    }

    /*
    ==========================================
    MOVE
    ==========================================
    */

    if (
      /\bmove\b/i.test(
        text
      ) &&
      (
        text.includes("\\") ||
        /\b(file|folder|directory)\b/i.test(
          text
        )
      )
    ) {
      return {
        toolNames: [
          "file_move",
          "file_rename",
        ],

        description:
          "file move",
      };
    }

    /*
    ==========================================
    DELETE
    ==========================================
    */

    if (
      /\b(delete|remove)\b/i.test(
        text
      ) &&
      (
        text.includes("\\") ||
        /\b(file|folder|directory)\b/i.test(
          text
        )
      )
    ) {
      return {
        toolNames: [
          "file_delete_file",
          "file_delete_folder",
        ],

        description:
          "file or folder deletion",
      };
    }

    /*
    ==========================================
    WRITE FILE
    ==========================================
    */

    if (
      /\bcontent(?:s)?\s+to\b/i.test(
        text
      ) ||
      (
        /\b(change|update|edit|replace|overwrite)\b/i.test(
          text
        ) &&
        /\b(content|contents|file)\b/i.test(
          text
        )
      )
    ) {
      return {
        toolNames: [
          "file_write_file",
        ],

        description:
          "file_write_file",
      };
    }

    /*
    ==========================================
    CREATE FOLDER
    ==========================================
    */

    if (
      /\b(create|make)\b/i.test(
        text
      ) &&
      /\b(folder|directory)\b/i.test(
        text
      )
    ) {
      return {
        toolNames: [
          "file_create_folder",
        ],

        description:
          "file_create_folder",
      };
    }

    /*
    ==========================================
    CREATE FILE
    ==========================================
    */

    if (
      /\b(create|make)\b/i.test(
        text
      ) &&
      (
        /\bfile\b/i.test(
          text
        ) ||
        containsFileExtension
      )
    ) {
      return {
        toolNames: [
          "file_create_file",
        ],

        description:
          "file_create_file",
      };
    }

    /*
    ==========================================
    CHECK EXISTS
    ==========================================
    */

    if (
      /\b(exists|exist|present)\b/i.test(
        text
      ) &&
      (
        text.includes("\\") ||
        /\b(file|folder|directory|path)\b/i.test(
          text
        )
      )
    ) {
      return {
        toolNames: [
          "file_exists",
        ],

        description:
          "file_exists",
      };
    }

    /*
    ==========================================
    READ FILE
    ==========================================
    */

    if (
      (
        /\bread\b/i.test(
          text
        ) ||
        /\bexact content\b/i.test(
          text
        ) ||
        /\bfile content\b/i.test(
          text
        )
      ) &&
      (
        containsFileExtension ||
        text.includes("\\")
      )
    ) {
      return {
        toolNames: [
          "file_read_file",
        ],

        description:
          "file_read_file",
      };
    }

    /*
    ==========================================
    LIST DIRECTORY
    ==========================================
    */

    if (
      (
        /\blist\b/i.test(
          text
        ) ||
        /\bcontents?\b/i.test(
          text
        ) ||
        /\bwhat(?:'s| is)? inside\b/i.test(
          text
        ) ||
        /\btell me[\s\S]*inside\b/i.test(
          text
        )
      ) &&
      !containsFileExtension
    ) {
      return {
        toolNames: [
          "file_list_files",
        ],

        description:
          "file_list_files",
      };
    }

    /*
    ==========================================
    TERMINAL
    ==========================================
    */

    if (
      /\b(run|execute)\b/i.test(
        text
      ) &&
      /\b(npm|npx|node|git|pnpm|yarn|powershell|cmd|tsc)\b/i.test(
        text
      )
    ) {
      return {
        toolNames: [
          "terminal_run",
        ],

        description:
          "terminal_run",
      };
    }

    return null;
  }


  /*
  ==========================================
  EXTRACT EXACT FILE CONTENT
  ==========================================
  */

  private extractExactFileContent(
    userInput: string
  ): string | null {
    const matches =
      Array.from(
        userInput.matchAll(
          /\bcontent(?:s)?\s+to\s+/gi
        )
      );

    if (
      matches.length !== 1
    ) {
      return null;
    }

    const match =
      matches[0];

    const start =
      (match.index ?? 0) +
      match[0].length;

    let content =
      userInput
        .slice(start)
        .trim();

    if (!content) {
      return null;
    }

    const first =
      content[0];

    const last =
      content[
        content.length - 1
      ];

    /*
    Remove matching surrounding quotes.
    */

    if (
      content.length >= 2 &&
      first === last &&
      (
        first === '"' ||
        first === "'" ||
        first === "`"
      )
    ) {
      content =
        content.slice(
          1,
          -1
        );
    }

    return content;
  }


  /*
  ==========================================
  PERMISSION DENIED
  ==========================================
  */

  private isPermissionDenied(
    result: {
      success: boolean;
      message?: unknown;
    }
  ): boolean {
    if (result.success) {
      return false;
    }

    const message =
      String(
        result.message ?? ""
      ).toLowerCase();

    return (
      message.includes(
        "permission denied"
      ) ||
      message.includes(
        "permission was denied"
      ) ||
      message.includes(
        "not approved"
      ) ||
      message.includes(
        "user denied"
      ) ||
      message.includes(
        "approval denied"
      )
    );
  }


  /*
  ==========================================
  PATH SECURITY DENIED
  ==========================================
  */

  private isPathSecurityDenied(
    result: {
      success: boolean;
      message?: unknown;
    }
  ): boolean {
    if (result.success) {
      return false;
    }

    const message =
      String(
        result.message ?? ""
      ).toLowerCase();

    return (
      message.includes(
        "access denied"
      ) &&
      (
        message.includes(
          "outside allowed"
        ) ||
        message.includes(
          "allowed folders"
        )
      )
    );
  }


  /*
  ==========================================
  TERMINAL FALLBACK BLOCK
  ==========================================

  Example:

  User:
  List C:\Windows

  FileTool is the required authority.

  Qwen may NOT switch to terminal_run
  as a workaround.
  */

  private isBlockedTerminalFallback(
    toolName: string,
    requirement:
      ToolRequirement | null
  ): boolean {
    if (
      toolName !==
      "terminal_run"
    ) {
      return false;
    }

    if (!requirement) {
      return false;
    }

    return (
      requirement.description ===
        "file_list_files" ||
      requirement.description ===
        "file_read_file" ||
      requirement.description ===
        "file_exists"
    );
  }


  /*
  ==========================================
  SAVE FINAL ANSWER
  ==========================================
  */

  private saveFinalAnswer(
    answer: string
  ): string {
    this.memoryManager.remember(
      "assistant",
      answer
    );

    return answer;
  }


  /*
  ==========================================
  GENERATED FINAL ANSWER
  ==========================================
  */

  private generatedFinalAnswer(
    answer: string
  ): string {
    const message: Message = {
      role: "assistant",
      content: answer,
    };

    this.messages.push(
      message
    );

    this.memoryManager.remember(
      "assistant",
      answer
    );

    return answer;
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
    LONG-TERM MEMORY
    ==========================================
    */

    const longTermMemory =
      this.memoryManager
        .getContextForPrompt(
          userInput
        );

    const runMessages: Message[] = [
      ...this.messages,
    ];

    if (longTermMemory) {
      runMessages.push({
        role: "system",

        content: `
RELEVANT LONG-TERM MEMORY:

${longTermMemory}

Use this memory only when relevant.

The newest user instruction always has
priority over older memory.

Memory can be outdated.

For current computer state, use real tools.
`,
      });
    }

    /*
    ==========================================
    SAVE USER MESSAGE
    ==========================================
    */

    this.memoryManager.remember(
      "user",
      userInput
    );

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

    /*
    ==========================================
    TASK REQUIREMENTS
    ==========================================
    */

    const toolRequirement =
      this.getToolRequirement(
        userInput
      );

    const exactRequestedContent =
      this.extractExactFileContent(
        userInput
      );

    const successfulTools =
      new Set<string>();

    const MAX_STEPS = 30;

    let unresolvedToolFailure =
      false;

    let failureReminderCount =
      0;

    let toolRequirementReminderCount =
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
      ASK OLLAMA / QWEN
      ========================================
      */

      const response =
        await askOllama(
          runMessages,
          agentTools
        );

      const assistantMessage =
        response.message;

      const toolCalls =
        assistantMessage.tool_calls ??
        [];

      runMessages.push(
        assistantMessage
      );


      /*
      ========================================
      NO TOOL CALL
      ========================================
      */

      if (
        toolCalls.length === 0
      ) {
        /*
        Previous required tool failed.
        */

        if (
          unresolvedToolFailure
        ) {
          if (
            failureReminderCount < 2
          ) {
            runMessages.push({
              role: "system",

              content: `
A required tool action failed.

Do NOT claim success.

Review the tool error.

If it can be corrected safely,
use the correct tool.

Do NOT bypass security restrictions.

If the task cannot be completed,
clearly report failure.
`,
            });

            failureReminderCount++;

            continue;
          }

          return this.generatedFinalAnswer(
            "The requested action could not be completed because the required tool failed."
          );
        }


        /*
        ======================================
        REQUIRED TOOL GUARD
        ======================================
        */

        if (toolRequirement) {
          const requirementSatisfied =
            toolRequirement
              .toolNames
              .some(
                (toolName) =>
                  successfulTools.has(
                    toolName
                  )
              );

          if (
            !requirementSatisfied
          ) {
            if (
              toolRequirementReminderCount <
              2
            ) {
              runMessages.push({
                role: "system",

                content: `
REQUIRED TOOL GUARD

The user's request requires a real tool action.

Required tool/action:

${toolRequirement.description}

The required tool has NOT successfully executed yet.

Do not claim success.

Call the appropriate tool now.
`,
              });

              toolRequirementReminderCount++;

              continue;
            }

            return this.generatedFinalAnswer(
              "I could not safely complete the request because the required tool was not executed."
            );
          }
        }


        /*
        ======================================
        NORMAL FINAL ANSWER
        ======================================
        */

        const answer =
          assistantMessage
            .content
            ?.trim();

        if (answer) {
          this.messages.push(
            assistantMessage
          );

          return this.saveFinalAnswer(
            answer
          );
        }

        if (
          successfulTools.size > 0
        ) {
          return this.generatedFinalAnswer(
            "Task completed successfully."
          );
        }

        return this.generatedFinalAnswer(
          "No action was completed."
        );
      }


      /*
      ========================================
      STORE TOOL-CALL ASSISTANT MESSAGE
      ========================================
      */

      this.messages.push(
        assistantMessage
      );

      let currentBatchFailed =
        false;

      let currentBatchSucceeded =
        false;


      /*
      ========================================
      PROCESS TOOL CALLS
      ========================================
      */

      for (
        const toolCall
        of toolCalls
      ) {
        const toolName =
          toolCall.function.name;

        const rawArgs: unknown =
  toolCall.function.arguments;


        /*
        ======================================
        BUILD CANDIDATE ARGUMENTS
        ======================================

        We clone object arguments before
        validation so exact-content protection
        can be applied safely.
        */

        let candidateArgs:
          unknown =
          rawArgs;

        if (
          rawArgs !== null &&
          typeof rawArgs ===
            "object" &&
          !Array.isArray(
            rawArgs
          )
        ) {
          const clonedArgs:
            Record<
              string,
              unknown
            > = {
              ...(
                rawArgs as Record<
                  string,
                  unknown
                >
              ),
            };


          /*
          ====================================
          EXACT CONTENT PROTECTION
          ====================================

          User:
          content to hello

          Qwen:
          hello /

          Real execution:
          hello
          */

          if (
            exactRequestedContent !==
              null &&
            (
              toolName ===
                "file_write_file" ||
              toolName ===
                "file_create_file"
            )
          ) {
            clonedArgs.content =
              exactRequestedContent;
          }

          candidateArgs =
            clonedArgs;
        }


        /*
        ======================================
        VALIDATE TOOL ARGUMENTS
        ======================================

        FLOW:

        Qwen
        ↓
        NativeToolValidator
        ↓
        mapNativeToolCall
        ↓
        PermissionManager
        ↓
        real tool
        */

        const validation =
          validateNativeToolCall(
            toolName,
            candidateArgs
          );


        /*
        ======================================
        VALIDATION FAILED
        ======================================
        */

        if (
          !validation.success
        ) {
          const validationResult = {
            success: false,

            message:
              validation.message,
          };

          console.log(
            `\n🛡️ Validation blocked: ${toolName}`
          );

          console.log(
            validationResult
          );

          const toolMessage: Message = {
            role: "tool",

            tool_name:
              toolName,

            content:
              JSON.stringify(
                validationResult
              ),
          };

          runMessages.push(
            toolMessage
          );

          this.messages.push(
            toolMessage
          );

          currentBatchFailed =
            true;

          continue;
        }


        /*
        These arguments have now passed
        runtime validation.
        */

        const args =
          validation.args;


        console.log(
          `\n🔧 Native tool call: ${toolName}`
        );

        console.log(
          "Arguments:",
          args
        );


        /*
        ======================================
        BLOCK TERMINAL SECURITY WORKAROUND
        ======================================
        */

        if (
          this.isBlockedTerminalFallback(
            toolName,
            toolRequirement
          )
        ) {
          const blockedResult = {
            success: false,

            message:
              "Terminal fallback is not allowed for this file-system request. Use the required FileTool.",
          };

          console.log(
            "\n🛡️ Security blocked:"
          );

          console.log(
            blockedResult
          );

          const toolMessage: Message = {
            role: "tool",

            tool_name:
              toolName,

            content:
              JSON.stringify(
                blockedResult
              ),
          };

          runMessages.push(
            toolMessage
          );

          this.messages.push(
            toolMessage
          );

          currentBatchFailed =
            true;

          continue;
        }


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

        Normally the validator already blocks
        unknown tools, but keep defense-in-depth.
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
        SEND RESULT BACK TO QWEN
        ======================================
        */

        const resultForModel = {
          ...result,

          executedArguments:
            args,
        };

        const toolMessage: Message = {
          role: "tool",

          tool_name:
            toolName,

          content:
            JSON.stringify(
              resultForModel
            ),
        };

        runMessages.push(
          toolMessage
        );

        this.messages.push(
          toolMessage
        );


        /*
        ======================================
        PERMISSION DENIED
        ======================================

        Do not retry automatically.
        */

        if (
          this.isPermissionDenied(
            result
          )
        ) {
          return this.generatedFinalAnswer(
            "Permission denied. The action was not performed."
          );
        }


        /*
        ======================================
        PATH SECURITY DENIED
        ======================================
        */

        if (
          this.isPathSecurityDenied(
            result
          )
        ) {
          return this.generatedFinalAnswer(
            String(
              result.message
            )
          );
        }


        /*
        ======================================
        SUCCESS
        ======================================
        */

        if (result.success) {
          currentBatchSucceeded =
            true;

          successfulTools.add(
            toolName
          );

          /*
          Do not duplicate explicit
          memory-tool records.
          */

          if (
            !toolName.startsWith(
              "memory_"
            )
          ) {
            this.memoryManager
              .rememberToolResult(
                toolName,
                result
              );
          }
        } else {
          /*
          ====================================
          FAILURE
          ====================================
          */

          currentBatchFailed =
            true;
        }
      }


      /*
      ========================================
      UPDATE FAILURE STATE
      ========================================
      */

      const requirementSatisfied =
        !toolRequirement ||
        toolRequirement
          .toolNames
          .some(
            (toolName) =>
              successfulTools.has(
                toolName
              )
          );


      if (
        currentBatchFailed &&
        !requirementSatisfied
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


    return this.generatedFinalAnswer(
      "The agent stopped because the maximum number of steps was reached."
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