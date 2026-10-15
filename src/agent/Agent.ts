import type { Message } from "ollama";

import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import { TerminalTool } from "../tools/TerminalTool.js";
import {
  agentTools,
  mapNativeToolCall,
} from "../tools/NativeToolDefinitions.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import { PermissionManager } from "../security/PermissionManager.js";
import { askForApproval } from "../security/ConsoleApproval.js";
import { validateNativeToolCall } from "../security/NativeToolValidator.js";
import { MemoryTool } from "../tools/MemoryTool.js";
import { MemoryManager } from "../memory/MemoryManager.js";
import { GmailTool } from "../tools/GmailTool.js";

import { Executor } from "./Executor.js";

import {
  detectToolRequirement,
  type ToolRequirement,
} from "./ToolRequirementDetector.js";

import {
  GmailComposeManager,
  type GmailDraft,
} from "./GmailComposeManager.js";
import {
  getCapabilityResponse,
} from "./CapabilityResponder.js";


type ApprovalFunction = (
  message: string
) => Promise<boolean>;


type ToolExecutionResult = {
  success: boolean;
  message?: unknown;
  data?: unknown;
};


export class Agent {
  private executor: Executor;

  private messages: Message[];

  private memoryManager:
    MemoryManager;

  private gmailComposeManager:
    GmailComposeManager;


  constructor(
    approvalFunction:
      ApprovalFunction =
      askForApproval
  ) {
    /*
    ==========================================
    PERMISSIONS
    ==========================================
    */

    const permissionManager =
      new PermissionManager(
        approvalFunction
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
    MEMORY
    ==========================================
    */

    this.memoryManager =
      new MemoryManager();


    /*
    ==========================================
    GMAIL COMPOSE STATE
    ==========================================
    */

    this.gmailComposeManager =
      new GmailComposeManager();


    /*
    ==========================================
    TOOLS
    ==========================================
    */

    const fileTool =
      new FileTool([
        process.cwd(),
        "S:\\",
      ]);


    const terminalTool =
      new TerminalTool([
        process.cwd(),
        "S:\\",
      ]);


    const memoryTool =
      new MemoryTool(
        this.memoryManager
      );


    const gmailTool =
      new GmailTool();


    this.executor.registerTool(
      fileTool
    );


    this.executor.registerTool(
      terminalTool
    );


    this.executor.registerTool(
      memoryTool
    );


    this.executor.registerTool(
      gmailTool
    );


    /*
    ==========================================
    START CONVERSATION
    ==========================================
    */

    this.messages = [
      {
        role:
          "system",

        content:
          buildSystemPrompt(),
      },
    ];
  }


  /*
  ==========================================
  EXACT FILE CONTENT
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
      matches.length !==
      1
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
        .slice(
          start
        )
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
    result:
      ToolExecutionResult
  ): boolean {
    if (
      result.success
    ) {
      return false;
    }


    const message =
      String(
        result.message ??
        ""
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
    result:
      ToolExecutionResult
  ): boolean {
    if (
      result.success
    ) {
      return false;
    }


    const message =
      String(
        result.message ??
        ""
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
  TERMINAL FALLBACK SECURITY
  ==========================================
  */

  private isBlockedTerminalFallback(
    toolName: string,

    requirement:
      ToolRequirement | null
  ): boolean {
    if (
      toolName !==
        "terminal_run" ||
      !requirement
    ) {
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
  REQUIREMENT CHECK
  ==========================================
  */

  private requirementSatisfied(
    requirement:
      ToolRequirement | null,

    successfulTools:
      Set<string>
  ): boolean {
    if (
      !requirement
    ) {
      return true;
    }


    return requirement
      .toolNames
      .some(
        (
          toolName
        ) =>
          successfulTools.has(
            toolName
          )
      );
  }


  /*
  ==========================================
  SAVE NORMAL FINAL ANSWER
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
    const message:
      Message = {
      role:
        "assistant",

      content:
        answer,
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
  PRIVATE FINAL ANSWER

  Used for Gmail and other data that
  should not automatically enter
  long-term memory.
  ==========================================
  */

  private generatedPrivateFinalAnswer(
    answer: string
  ): string {
    const message:
      Message = {
      role:
        "assistant",

      content:
        answer,
    };


    this.messages.push(
      message
    );


    return answer;
  }


  /*
  ==========================================
  ADD TOOL MESSAGE
  ==========================================
  */

  private addToolMessage(
    runMessages:
      Message[],

    toolName:
      string,

    payload:
      unknown
  ): void {
    const toolMessage:
      Message = {
      role:
        "tool",

      tool_name:
        toolName,

      content:
        JSON.stringify(
          payload
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
  ==========================================
  CLEAN GMAIL TEXT
  ==========================================
  */

  private cleanGmailText(
    value:
      unknown,

    preserveLineBreaks =
      false
  ): string {
    let text =
      String(
        value ??
        ""
      );


    /*
    Remove tracking-style links:

    <https://very-long-link>Google

    becomes:

    Google
    */

    text =
      text.replace(
        /<https?:\/\/[^>]+>/gi,
        ""
      );


    /*
    Decode common HTML entities.
    */

    text =
      text

        .replace(
          /&#39;/gi,
          "'"
        )

        .replace(
          /&#x27;/gi,
          "'"
        )

        .replace(
          /&apos;/gi,
          "'"
        )

        .replace(
          /&quot;/gi,
          '"'
        )

        .replace(
          /&nbsp;/gi,
          " "
        )

        .replace(
          /&lt;/gi,
          "<"
        )

        .replace(
          /&gt;/gi,
          ">"
        )

        .replace(
          /&amp;/gi,
          "&"
        );


    /*
    Remove invisible email characters.
    */

    text =
      text.replace(
        /[\u200B-\u200D\uFEFF\u00AD]/g,
        ""
      );


    if (
      preserveLineBreaks
    ) {
      return text

        .replace(
          /\r\n/g,
          "\n"
        )

        .replace(
          /\r/g,
          "\n"
        )

        .replace(
          /[ \t]+\n/g,
          "\n"
        )

        .replace(
          /\n{3,}/g,
          "\n\n"
        )

        .trim();
    }


    return text

      .replace(
        /\s+/g,
        " "
      )

      .trim();
  }


  /*
  ==========================================
  FORMAT DIRECT GMAIL RESULTS
  ==========================================
  */

  private formatDirectGmailResult(
    toolName:
      string,

    result:
      ToolExecutionResult,

    userInput:
      string
  ): string | null {
    if (
      !result.success ||

      ![
        "gmail_recent",
        "gmail_search",
        "gmail_read",
      ].includes(
        toolName
      )
    ) {
      return null;
    }


    if (
      !result.data ||

      typeof result.data !==
        "object" ||

      Array.isArray(
        result.data
      )
    ) {
      return null;
    }


    const data =
      result.data as Record<
        string,
        unknown
      >;


    /*
    ========================================
    GMAIL READ
    ========================================
    */

    if (
      toolName ===
      "gmail_read"
    ) {
      const id =
        String(
          data.id ??
          ""
        );


      const from =
        this.cleanGmailText(
          data.from
        );


      const to =
        this.cleanGmailText(
          data.to
        );


      const subject =
        this.cleanGmailText(
          data.subject ??
          "(No subject)"
        );


      const date =
        this.cleanGmailText(
          data.date
        );


      const body =
        this.cleanGmailText(
          data.body ??
          data.snippet ??
          "",

          true
        );


      const lines:
        string[] = [
        subject,
      ];


      if (from) {
        lines.push(
          `From: ${from}`
        );
      }


      if (to) {
        lines.push(
          `To: ${to}`
        );
      }


      if (date) {
        lines.push(
          `Date: ${date}`
        );
      }


      if (id) {
        lines.push(
          `Gmail ID: ${id}`
        );
      }


      if (body) {
        lines.push(
          "",
          body
        );
      }


      return lines.join(
        "\n"
      );
    }


    /*
    ========================================
    GMAIL RECENT / SEARCH
    ========================================
    */

    const rawEmails =
      data.emails;


    if (
      !Array.isArray(
        rawEmails
      )
    ) {
      return null;
    }


    if (
      rawEmails.length ===
      0
    ) {
      return toolName ===
        "gmail_search"

        ? "No matching emails were found."

        : "No recent emails were found.";
    }


    const wantsIds =
      /\b(?:gmail\s+)?(?:message\s+)?ids?\b/i
        .test(
          userInput
        );


    const emails =
      rawEmails.map(
        (
          email,
          index
        ) => {
          if (
            !email ||

            typeof email !==
              "object" ||

            Array.isArray(
              email
            )
          ) {
            return `${
              index + 1
            }. Email`;
          }


          const item =
            email as Record<
              string,
              unknown
            >;


          const subject =
            this.cleanGmailText(
              item.subject ??
              "(No subject)"
            );


          const from =
            this.cleanGmailText(
              item.from
            );


          const date =
            this.cleanGmailText(
              item.date
            );


          const snippet =
            this.cleanGmailText(
              item.snippet
            );


          const id =
            String(
              item.id ??
              ""
            );


          const lines:
            string[] = [
            `${
              index + 1
            }. ${subject}`,
          ];


          if (from) {
            lines.push(
              `From: ${from}`
            );
          }


          if (date) {
            lines.push(
              `Date: ${date}`
            );
          }


          if (
            wantsIds &&
            id
          ) {
            lines.push(
              `Gmail ID: ${id}`
            );
          }


          if (snippet) {
            lines.push(
              `Snippet: ${snippet}`
            );
          }


          return lines.join(
            "\n"
          );
        }
      );


    const heading =
      toolName ===
        "gmail_recent"

        ? `Here are your latest ${rawEmails.length} emails:`

        : `Found ${rawEmails.length} matching emails:`;


    return (
      `${heading}\n\n` +

      emails.join(
        "\n\n"
      )
    );
  }


  /*
  ==========================================
  GMAIL SEND SUCCESS
  ==========================================
  */

  private buildGmailSendSuccess(
    result:
      ToolExecutionResult,

    args:
      Record<
        string,
        unknown
      >
  ): string {
    const data =
      result.data &&

      typeof result.data ===
        "object" &&

      !Array.isArray(
        result.data
      )

        ? result.data as Record<
            string,
            unknown
          >

        : {};


    const to =
      String(
        data.to ??
        args.to ??
        ""
      );


    const subject =
      String(
        data.subject ??
        args.subject ??
        ""
      );


    const id =
      String(
        data.id ??
        ""
      );


    const lines = [
      "✅ Email sent successfully.",
    ];


    if (to) {
      lines.push(
        `To: ${to}`
      );
    }


    if (subject) {
      lines.push(
        `Subject: ${subject}`
      );
    }


    if (id) {
      lines.push(
        `Gmail ID: ${id}`
      );
    }


    return lines.join(
      "\n"
    );
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
  CURRENT USER MESSAGE
  ==========================================
  */

  const userMessage:
    Message = {
    role:
      "user",

    content:
      userInput,
  };


  this.messages.push(
    userMessage
  );


  /*
  ==========================================
  KNOWN CAPABILITY RESPONSES
  ==========================================

  Do not ask the language model to guess
  what the local agent can actually do.
  ==========================================
  */

  const capabilityResponse =
    getCapabilityResponse(
      userInput
    );


  if (
    capabilityResponse
  ) {
    return this
      .generatedPrivateFinalAnswer(
        capabilityResponse
      );
  }


  /*
  ==========================================
  DETECT REQUIRED TOOL
  ==========================================
  */

  const detectedToolRequirement =
    detectToolRequirement(
      userInput
    );


  /*
  ==========================================
  GMAIL COMPOSE MANAGER
  ==========================================
  */

  const gmailCompose =
    this.gmailComposeManager
      .process(
        userInput,

        detectedToolRequirement
          ?.description ===
          "gmail_send"
      );


    /*
    ==========================================
    CURRENT USER MESSAGE
    ==========================================
    */



    this.messages.push(
      userMessage
    );


    /*
    Gmail compose follow-up question.

    Example:

    Send an email
    ↓
    What email address should I send it to?
    */

    if (
      gmailCompose.kind ===
      "reply"
    ) {
      return this
        .generatedPrivateFinalAnswer(
          gmailCompose.message
        );
    }


    /*
    ==========================================
    COMPLETE GMAIL DRAFT
    ==========================================
    */

    const resolvedGmailDraft:
      GmailDraft | null =

      gmailCompose.kind ===
        "ready"

        ? gmailCompose.draft

        : null;


    /*
    A finished Gmail draft becomes
    a required gmail_send action.
    */

    const toolRequirement:
      ToolRequirement | null =

      resolvedGmailDraft

        ? {
            toolNames: [
              "gmail_send",
            ],

            description:
              "gmail_send",
          }

        : detectedToolRequirement;


    /*
    ==========================================
    EXACT FILE CONTENT
    ==========================================
    */

    const exactRequestedContent =
      this.extractExactFileContent(
        userInput
      );


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


    /*
    The current user message was already
    added to this.messages.

    Remove it temporarily so memory context
    can be inserted BEFORE the current user
    message.
    */

    const runMessages:
      Message[] = [
      ...this.messages.slice(
        0,
        -1
      ),
    ];


    if (
      longTermMemory
    ) {
      runMessages.push({
        role:
          "system",

        content: `
RELEVANT LONG-TERM MEMORY:

${longTermMemory}

Use this memory only when relevant.
The newest user instruction has priority over older memory.
Memory can be outdated.
For current computer state, use real tools.
`,
      });
    }


    runMessages.push(
      userMessage
    );


    /*
    ==========================================
    SAVE USER MEMORY
    ==========================================

    Gmail compose/send contents are NOT
    automatically written to SQLite memory.
    ==========================================
    */

    if (
      toolRequirement
        ?.description !==
        "gmail_send" &&

      gmailCompose.kind ===
        "none"
    ) {
      this.memoryManager
        .remember(
          "user",
          userInput
        );
    }


    /*
    ==========================================
    AGENT LOOP STATE
    ==========================================
    */

    const successfulTools =
      new Set<string>();


    const successfulToolCalls =
      new Map<
        string,
        ToolExecutionResult
      >();


    const MAX_STEPS =
      30;


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

      step <=
        MAX_STEPS;

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
      ASK OLLAMA

      Normal chat:
      qwen3:1.7b

      Real tool task:
      qwen3:8b
      ========================================
      */

      const response =
        await askOllama(
          runMessages,

          toolRequirement
            ? agentTools
            : [],

          toolRequirement
            ? "agent"
            : "chat"
        );


      const assistantMessage =
        response.message;


      const toolCalls =
        assistantMessage
          .tool_calls ??
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
        toolCalls.length ===
        0
      ) {
        /*
        Previous required tool failed.
        */

        if (
          unresolvedToolFailure
        ) {
          if (
            failureReminderCount <
            2
          ) {
            runMessages.push({
              role:
                "system",

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


          return this
            .generatedFinalAnswer(
              "The requested action could not be completed because the required tool failed."
            );
        }


        /*
        ======================================
        REQUIRED TOOL GUARD
        ======================================
        */

        if (
          !this.requirementSatisfied(
            toolRequirement,
            successfulTools
          )
        ) {
          if (
            toolRequirementReminderCount <
            2
          ) {
            runMessages.push({
              role:
                "system",

              content: `
REQUIRED TOOL GUARD

The user's request requires a real tool action.

Required tool/action:
${toolRequirement?.description ?? "unknown"}

The required tool has NOT successfully executed yet.

Do not claim success.

Call the appropriate tool now.
`,
            });


            toolRequirementReminderCount++;


            continue;
          }


          return this
            .generatedFinalAnswer(
              "I could not safely complete the request because the required tool was not executed."
            );
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


          return this
            .saveFinalAnswer(
              answer
            );
        }


        if (
          successfulTools.size >
          0
        ) {
          return this
            .generatedFinalAnswer(
              "Task completed successfully."
            );
        }


        return this
          .generatedFinalAnswer(
            "No action was completed."
          );
      }


      /*
      Tool-call assistant message
      becomes part of conversation.
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


        const rawArgs:
          unknown =
          toolCall.function
            .arguments;


        /*
        ======================================
        BUILD CANDIDATE ARGUMENTS
        ======================================
        */

        let candidateArgs:
          unknown =
          rawArgs;


        if (
          rawArgs !==
            null &&

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
          EXACT FILE CONTENT PROTECTION
          ====================================
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
        GMAIL SEND PROTECTION
        ======================================

        Qwen cannot decide:

        recipient
        subject
        body

        Only GmailComposeManager can.
        ======================================
        */

        if (
          toolName ===
          "gmail_send"
        ) {
          if (
            !resolvedGmailDraft
          ) {
            const blockedResult = {
              success:
                false,

              message:
                "gmail_send blocked because recipient, subject, and message were not completed by the Gmail compose flow.",
            };


            console.log(
              "\n🛡️ Gmail send blocked:"
            );


            console.log(
              blockedResult
            );


            this.addToolMessage(
              runMessages,
              toolName,
              blockedResult
            );


            currentBatchFailed =
              true;


            continue;
          }


          candidateArgs = {
            ...(
              candidateArgs &&

              typeof candidateArgs ===
                "object" &&

              !Array.isArray(
                candidateArgs
              )

                ? candidateArgs as Record<
                    string,
                    unknown
                  >

                : {}
            ),


            to:
              resolvedGmailDraft.to,


            subject:
              resolvedGmailDraft.subject,


            body:
              resolvedGmailDraft.body,
          };
        }


        /*
        ======================================
        VALIDATE TOOL ARGUMENTS
        ======================================
        */

        const validation =
          validateNativeToolCall(
            toolName,
            candidateArgs
          );


        if (
          !validation.success
        ) {
          const validationResult = {
            success:
              false,

            message:
              validation.message,
          };


          console.log(
            `\n🛡️ Validation blocked: ${toolName}`
          );


          console.log(
            validationResult
          );


          this.addToolMessage(
            runMessages,
            toolName,
            validationResult
          );


          currentBatchFailed =
            true;


          continue;
        }


        const args =
          validation.args;


        /*
        ======================================
        DUPLICATE SUCCESS PROTECTION
        ======================================
        */

        const toolCallKey =
          `${toolName}:${JSON.stringify(
            args
          )}`;


        const previousSuccessfulResult =
          successfulToolCalls.get(
            toolCallKey
          );


        if (
          previousSuccessfulResult
        ) {
          console.log(
            `\n♻️ Duplicate tool call blocked: ${toolName}`
          );


          this.addToolMessage(
            runMessages,

            toolName,

            {
              ...previousSuccessfulResult,

              message:
                "This exact tool call already succeeded. Use the previous result and answer the user now. Do not call the same tool again with the same arguments.",

              executedArguments:
                args,
            }
          );


          runMessages.push({
            role:
              "system",

            content:
              "The exact same tool call already succeeded. Do NOT call it again. Use the successful result already provided and answer the user's request now.",
          });


          successfulTools.add(
            toolName
          );


          continue;
        }


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
            success:
              false,

            message:
              "Terminal fallback is not allowed for this file-system request. Use the required FileTool.",
          };


          console.log(
            "\n🛡️ Security blocked:"
          );


          console.log(
            blockedResult
          );


          this.addToolMessage(
            runMessages,
            toolName,
            blockedResult
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


        if (
          !request
        ) {
          const errorResult = {
            success:
              false,

            message:
              `Unknown tool: ${toolName}`,
          };


          this.addToolMessage(
            runMessages,
            toolName,
            errorResult
          );


          currentBatchFailed =
            true;


          continue;
        }


        /*
        ======================================
        EXECUTE REAL TOOL
        ======================================
        */

        const result =
          await this.executor
            .execute(
              request
            );


        console.log(
          "\n🔧 Tool result:"
        );


        console.log(
          result
        );


        /*
        Send tool result back to
        Qwen/context.
        */

        this.addToolMessage(
          runMessages,

          toolName,

          {
            ...result,

            executedArguments:
              args,
          }
        );


        /*
        ======================================
        PERMISSION DENIED
        ======================================
        */

        if (
          this.isPermissionDenied(
            result
          )
        ) {
          if (
            toolName ===
            "gmail_send"
          ) {
            this.gmailComposeManager
              .clear();
          }


          return this
            .generatedFinalAnswer(
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
          return this
            .generatedFinalAnswer(
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

        if (
          result.success
        ) {
          currentBatchSucceeded =
            true;


          successfulTools.add(
            toolName
          );


          successfulToolCalls.set(
            toolCallKey,

            {
              success:
                result.success,

              message:
                result.message,

              data:
                result.data,
            }
          );


          /*
          ====================================
          FAST GMAIL SEND
          ====================================
          */

          if (
            toolName ===
            "gmail_send"
          ) {
            this.gmailComposeManager
              .clear();


            return this
              .generatedPrivateFinalAnswer(
                this.buildGmailSendSuccess(
                  result,
                  args
                )
              );
          }


          /*
          ====================================
          FAST GMAIL READ / SEARCH / RECENT
          ====================================
          */

          if (
            toolName ===
              "gmail_recent" ||

            toolName ===
              "gmail_search" ||

            toolName ===
              "gmail_read"
          ) {
            const gmailAnswer =
              this.formatDirectGmailResult(
                toolName,
                result,
                userInput
              );


            if (
              gmailAnswer
            ) {
              return this
                .generatedPrivateFinalAnswer(
                  gmailAnswer
                );
            }
          }


          /*
          Do not duplicate explicit
          memory records or Gmail data
          into general tool memory.
          */

          if (
            !toolName.startsWith(
              "memory_"
            ) &&

            !toolName.startsWith(
              "gmail_"
            )
          ) {
            this.memoryManager
              .rememberToolResult(
                toolName,
                result
              );
          }
        }

        else {
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
        this.requirementSatisfied(
          toolRequirement,
          successfulTools
        );


      if (
        currentBatchFailed &&
        !requirementSatisfied
      ) {
        unresolvedToolFailure =
          true;
      }

      else if (
        currentBatchSucceeded
      ) {
        unresolvedToolFailure =
          false;


        failureReminderCount =
          0;
      }
    }


    /*
    ==========================================
    MAX STEPS
    ==========================================
    */

    return this
      .generatedFinalAnswer(
        "The agent stopped because the maximum number of steps was reached."
      );
  }


  /*
  ==========================================
  RESET CONVERSATION
  ==========================================
  */

  resetConversation():
    void {
    /*
    Cancel any unfinished Gmail draft.
    */

    this.gmailComposeManager
      .clear();


    /*
    Reset only short-term conversation.
    SQLite memory remains.
    */

    this.messages = [
      {
        role:
          "system",

        content:
          buildSystemPrompt(),
      },
    ];


    console.log(
      "🧠 Short-term conversation memory cleared."
    );
  }
}