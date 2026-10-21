import ollama, { type Message } from "ollama";

import nodePath from "node:path";

import { Planner, type PlannerDecision } from "./Planner.js";

import { PendingFileConfirmation } from "./PendingFileConfirmation.js";

import { validatePlan } from "./PlanValidator.js";

import { TaskContext } from "./TaskContext.js";

import { TaskRunner } from "./TaskRunner.js";

import { askOllama } from "../ollama/OllamaClient.js";

import { FileTool } from "../tools/FileTool.js";

import { TerminalTool } from "../tools/TerminalTool.js";

import {

  allAgentTools,

  mapAgentToolCall,

  validateAgentToolCall,

} from "../tools/AgentToolRouter.js";

import { BrowserTool } from "../tools/BrowserTool.js";

import { buildSystemPrompt } from "../prompts/systemPrompt.js";

import { PermissionManager } from "../security/PermissionManager.js";

import { askForApproval } from "../security/ConsoleApproval.js";

import { MemoryTool } from "../tools/MemoryTool.js";

import { MemoryManager } from "../memory/MemoryManager.js";

import { GmailTool } from "../tools/GmailTool.js";

import { Executor } from "./Executor.js";

import { ResultInterpreter } from "./ResultInterpreter.js";

import {

  detectToolRequirement,

  type ToolRequirement,

} from "./ToolRequirementDetector.js";

import { detectBrowserRequirement } from "./BrowserRequirementDetector.js";

import {

  GmailComposeManager,

  type GmailDraft,

} from "./GmailComposeManager.js";

import {

  getCapabilityResponse,

} from "./CapabilityResponder.js";

import {

  summarizeBrowserPage,

} from "../browser/BrowserSummarizer.js";

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

  // These roots are authorized for file discovery, but results still must be
  // grounded by a real tool response before later operations use their paths.
  private readonly fileDiscoveryRoots = ["S:\\"];

  private readonly aiPlanner = new Planner();

  private readonly resultInterpreter = new ResultInterpreter();

  private readonly aiTaskContext = new TaskContext();

  private pendingFileConfirmation = new PendingFileConfirmation();

  // Planner clarifications are separate from validated-plan path approvals.
  // Preserve their original request instead of treating "yes" as a new task.
  private pendingPlannerClarification: {
    originalInstruction: string;
    question: string;
    startedAt: number;
  } | null = null;

  private readonly plannerClarificationLifetimeMs = 15 * 60 * 1000;

  // Expose every registered native file action to the AI planner.

  // This is a TOOL policy, not natural-language sentence matching.

  private readonly aiFileTools = allAgentTools.filter(

    (tool) => tool.function?.name?.startsWith("file_") === true

  );

  // Read-only Gmail actions are available to the SAME AI planner as file
  // actions. This prevents a request to search email from being treated as
  // a request to search C:\Users or another filesystem path.
  private readonly aiReadOnlyGmailTools = allAgentTools.filter(
    (tool) => ["gmail_recent", "gmail_search", "gmail_read"].includes(
      tool.function?.name ?? ""
    )
  );

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

        ...this.fileDiscoveryRoots,

      ]);

    const terminalTool =

      new TerminalTool([

        process.cwd(),

        ...this.fileDiscoveryRoots,

      ]);

    const memoryTool =

      new MemoryTool(

        this.memoryManager

      );

    const gmailTool =

      new GmailTool();

    const browserTool =

      new BrowserTool();

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

    this.executor.registerTool(

      browserTool

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

    <https\\\\\\\\\\\\\\\\://very-long-link>Google

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

  /**

   * Conservative browser fast path. Only commands with an unambiguous intent

   * are handled without an LLM; all others fall through to the agent loop.

   * The existing Validator -> Executor -> PermissionManager is ALWAYS used.

   */

  private async tryFastBrowserCommand(userInput: string): Promise<string | null> {

    const input = userInput.trim();

    let toolName: string | null = null;

    let args: Record<string, unknown> = {};

    let summarize = false;

    // URL opening, optionally followed by a homepage summary.

    const openMatch = input.match(

      /^(?:please\s+)?(?:open|visit|go\s+to|navigate\s+to)\s+(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)(?:\s+(?:and\s+)?(?:(?:give\s+me\s+)?(?:a\s+)?(?:short\s+)?(?:summary|summarize|describe)(?:\s+(?:its|the|this)\s+(?:homepage|page|website|site))?))?[.!?]?$/i

    );

    if (openMatch) {

      toolName = "browser_open";

      // Punctuation after a naked domain is not part of the URL.

      const url = openMatch[1].replace(/[.,!?]+$/, "");

      args = { url: /^https?:\/\//i.test(url) ? url : `https://${url}` };

      summarize = /\b(summary|summarize|describe)\b/i.test(input);

    } else if (/^(?:please\s+)?(?:read|summarize|describe)(?:\s+(?:the|this|current))?\s+(?:webpage|website|page|site|homepage)(?:\s+(?:for\s+me))?[.!?]?$/i.test(input)) {

      toolName = "browser_read_page";

      summarize = /\b(summarize|describe)\b/i.test(input);

    } else if (/^(?:please\s+)?(?:what(?:'s| is)\s+the\s+(?:current\s+)?(?:page\s+)?(?:title|url)|(?:get|show)(?:\s+me)?\s+(?:the\s+)?(?:current\s+)?(?:page\s+)?(?:title|url|page\s+info|browser\s+info))[.!?]?$/i.test(input)) {

      toolName = "browser_get_info";

    } else if (/^(?:please\s+)?(?:go\s+back|browser\s+back|back)(?:\s+(?:one\s+)?page)?[.!?]?$/i.test(input)) {

      toolName = "browser_back";

    } else if (/^(?:please\s+)?(?:go\s+forward|browser\s+forward|forward)(?:\s+(?:one\s+)?page)?[.!?]?$/i.test(input)) {

      toolName = "browser_forward";

    } else if (/^(?:please\s+)?(?:reload|refresh)(?:\s+(?:the\s+)?(?:current\s+)?(?:page|website|browser))?[.!?]?$/i.test(input)) {

      toolName = "browser_reload";

    } else if (/^(?:please\s+)?close\s+(?:the\s+)?browser[.!?]?$/i.test(input)) {

      toolName = "browser_close";

    }

    if (!toolName) return null;

    const start = performance.now();

    const validation = validateAgentToolCall(toolName, args);

    if (!validation.success) {

      return this.generatedFinalAnswer(`Browser command rejected: ${validation.message}`);

    }

    const request = mapAgentToolCall(toolName, validation.args);

    if (!request) return this.generatedFinalAnswer("Unsupported browser action.");

    console.log(`[BrowserFastPath] ${toolName}`);

    const result = await this.executor.execute(request);

    if (!result.success) {

      console.warn("[BrowserFastPath] Failed:", result.message);

      return this.generatedFinalAnswer(

        this.isPermissionDenied(result)

          ? "Permission denied. The browser action was not performed."

          : `Browser action failed: ${String(result.message ?? "unknown error")}`

      );

    }

    let info = result.data as

      | { title?: string; url?: string; text?: string }

      | undefined;

    if (toolName === "browser_open" && summarize) {

      // Do NOT claim to have read the page if Playwright only opened it.

      // This second read gets its own validation and permission approval.

      const readValidation = validateAgentToolCall("browser_read_page", {});

      if (!readValidation.success) {

        return this.generatedFinalAnswer(`Page read validation failed: ${readValidation.message}`);

      }

      const readRequest = mapAgentToolCall("browser_read_page", readValidation.args);

      if (!readRequest) return this.generatedFinalAnswer("Page reading is unavailable.");

      const readResult = await this.executor.execute(readRequest);

      if (!readResult.success) {

        return this.generatedFinalAnswer(

          `Opened ${String(info?.url ?? args.url)} but could not read its content: ${String(readResult.message ?? "unknown error")}`

        );

      }

      info = readResult.data as { title?: string; url?: string; text?: string } | undefined;

    }

    let answer: string;

    if (summarize) {

      if (!info?.text?.trim() || !info.url || info.url === "about:blank") {

        answer = "The browser action succeeded, but I could not read useful page content to summarize. Try again after the page finishes loading.";

      } else {

        try {

          answer = await summarizeBrowserPage(

            { title: info.title ?? "", url: info.url, text: info.text },

            userInput

          );

        } catch (error) {

          answer = `The page was opened/read, but summarization failed: ${error instanceof Error ? error.message : String(error)}`;

        }

      }

    } else if (toolName === "browser_read_page") {

      answer = info?.text?.trim()

        ? `Page: ${info.title ?? ""}\nURL: ${info.url ?? ""}\n\n${info.text}`

        : "The browser returned no readable page text. It may still be loading or the tab may have closed.";

    } else if (toolName === "browser_get_info" || toolName === "browser_open") {

      answer = `${toolName === "browser_open" ? "Opened" : "Current page"}: ${info?.title || "(untitled)"}\nURL: ${info?.url ?? args.url ?? "unknown"}`;

    } else {

      answer = String(result.message ?? "Browser action completed.");

    }

    console.log(`[BrowserFastPath] Completed in ${((performance.now() - start) / 1000).toFixed(2)}s`);

    // Preserve tool result memory behavior for non-sensitive browsing actions.

    if (toolName !== "browser_close") this.memoryManager.rememberToolResult(toolName, result);

    return this.generatedFinalAnswer(answer);

  }

  /**

   * Fast, read-only Gmail actions. Ambiguous requests fall back to Ollama.

   * All API calls still pass through validation, Executor and permissions.

   * Never send or draft email from this path.

   */

  private async tryFastGmailCommand(userInput: string): Promise<string | null> {

    const input = userInput.trim();

    const normalized = input.replace(/[.!?]+$/, "").trim();

    // Compound or multiline requests need explicit sequencing; do not

    // mistake multiple Gmail commands for a single read-only action.

    if (/[\r\n]/.test(normalized)) return null;

    // Only exact, safe patterns are eligible. Never intercept a send,

    // compose, draft, reply, forward, delete, archive or mark request.

    if (/\b(send|compose|draft|reply|forward|delete|archive|mark|move|label|unsubscribe)\b/i.test(normalized)) {

      return null;

    }

    // Accept both "5 emails, include ..." and "5 emails. Include ...".

    const recentListMatch = normalized.match(

      /^(?:please\s+)?(?:show|list|display|get)(?:\s+me)?\s+(?:my\s+)?(?:latest|recent|newest|last)\s+(\d{1,2})\s+(?:emails|email messages|gmail messages)(?:\s*[.,;]?\s*include\s+(?:the\s+)?sender\s*,\s*subject\s*,?\s*and\s+date)?$/i

    );

    const recentDefaultMatch = /^(?:please\s+)?(?:show|list|display|get)(?:\s+me)?\s+(?:my\s+)?(?:latest|recent|newest)\s+(?:emails|email messages|gmail messages)$/i.test(normalized);

    const latestFullMatch = /^(?:please\s+)?(?:read|open|show)(?:\s+me)?\s+(?:my\s+)?(?:latest|newest|most recent|last)\s+(?:email|gmail|email message)(?:\s+and\s+(?:show(?:\s+me)?\s+)?(?:its\s+)?(?:complete|full|entire)\s+body(?:,?\s+not\s+just\s+the\s+snippet)?)?(?:\s+(?:in full|completely|fully))?$/i.test(normalized);

    const idMatch = normalized.match(/^(?:please\s+)?(?:read|open|show)(?:\s+me)?\s+(?:email|gmail|message)(?:\s+(?:with\s+)?id)?\s+([a-z0-9]{10,100})$/i);

    type GmailFastAction = "list" | "latest" | "id";

    let action: GmailFastAction;

    let limit = 5;

    let messageId = "";

    if (recentListMatch) {

      action = "list";

      limit = Number(recentListMatch[1]);

      if (limit < 1 || limit > 25) return null;

    } else if (recentDefaultMatch) {

      action = "list";

    } else if (latestFullMatch) {

      action = "latest";

    } else if (idMatch) {

      action = "id";

      messageId = idMatch[1];

    } else {

      return null;

    }

    const started = performance.now();

    console.log(`[GmailFastPath] ${action}`);

    const executeReadOnly = async (

      toolName: "gmail_recent" | "gmail_read",

      rawArgs: Record<string, unknown>

    ): Promise<ToolExecutionResult> => {

      const validation = validateAgentToolCall(toolName, rawArgs);

      if (!validation.success) {

        return { success: false, message: validation.message };

      }

      const request = mapAgentToolCall(toolName, validation.args);

      if (!request || request.tool !== "gmail" ||

          !["recent", "read"].includes(request.action)) {

        return { success: false, message: "Gmail action is unavailable." };

      }

      return this.executor.execute(request);

    };

    const failure = (result: ToolExecutionResult): string =>

      this.isPermissionDenied(result)

        ? "Permission denied. Gmail was not accessed."

        : `Gmail request failed: ${String(result.message ?? "Unknown error")}`;

    try {

      if (action === "list") {

        const result = await executeReadOnly("gmail_recent", { limit });

        if (!result.success) return this.generatedPrivateFinalAnswer(failure(result));

        const answer = this.formatDirectGmailResult("gmail_recent", result, userInput);

        return this.generatedPrivateFinalAnswer(answer ?? "Gmail returned an unexpected email list.");

      }

      if (action === "latest") {

        const recent = await executeReadOnly("gmail_recent", { limit: 1 });

        if (!recent.success) return this.generatedPrivateFinalAnswer(failure(recent));

        const data = recent.data as { emails?: Array<{ id?: unknown }> } | undefined;

        const id = data?.emails?.[0]?.id;

        if (typeof id !== "string" || !id.trim()) {

          return this.generatedPrivateFinalAnswer("No recent inbox email was found to read.");

        }

        messageId = id;

      }

      const result = await executeReadOnly("gmail_read", { id: messageId });

      if (!result.success) return this.generatedPrivateFinalAnswer(failure(result));

      const data = result.data as { body?: unknown } | undefined;

      if (typeof data?.body !== "string" || !data.body.trim()) {

        return this.generatedPrivateFinalAnswer(

          "Gmail retrieved the message, but it did not contain a readable full body. The preview is not a substitute for the complete email."

        );

      }

      const answer = this.formatDirectGmailResult("gmail_read", result, userInput);

      return this.generatedPrivateFinalAnswer(answer ?? "Gmail returned an unexpected message format.");

    } finally {

      console.log(`[GmailFastPath] Completed in ${((performance.now() - started) / 1000).toFixed(2)}s`);

    }

  }

  /** AI reasoning is separate from executable tool permissions.

   * There are no patterns for interpreting users' sentences here.

   * Absolute paths must originate in the current user's request or

   * from a previously verified tool result.

   */



/**
 * Detect a model-SUGGESTED absolute Windows path, not a user command.
 * It is never treated as an existing path until FileTool verifies it.
 */
private suggestedWindowsPaths(text: string): string[] {
  const candidates = text.match(/\b[A-Za-z]:\\[^\s\r\n<>|"']+/g) ?? [];
  return candidates
    .map((candidate) => candidate.replace(/[.,;!?)}\]]+$/, ""))
    .filter((candidate) => nodePath.win32.isAbsolute(candidate));
}

/**
 * Only a read-only search may be derived from an AI path guess. The file or
 * folder name must already appear in the user's request, and the search root
 * must be an explicitly configured discovery root. This never executes an
 * invented path and never generates a mutating action.
 */
private async tryGroundedDiscoveryFromClarification(
  originalInstruction: string,
  clarification: string
): Promise<string | null> {
  const canonical = (path: string) => nodePath.win32.normalize(path).toLowerCase();
  const candidates = this.suggestedWindowsPaths(clarification);
  if (candidates.length !== 1) return null;

  const proposed = candidates[0];
  const query = nodePath.win32.basename(proposed);
  const root = nodePath.win32.parse(proposed).root;
  if (!query || query === "." || query === "..") return null;
  if (originalInstruction.toLowerCase().includes(proposed.toLowerCase())) return null;
  if (!originalInstruction.toLowerCase().includes(query.toLowerCase())) return null;
  if (!this.fileDiscoveryRoots.some((allowed) => canonical(allowed) === canonical(root))) {
    return null;
  }

  // This is a generic *verification* of a planner-suggested location, not
  // natural-language intent matching. Exact path usage still requires a real
  // search result and a separate AI-selected read-only follow-up.
  const discoveryPlan: Extract<PlannerDecision, { kind: "plan" }> = {
    kind: "plan",
    goal: originalInstruction,
    steps: [{
      id: "step1",
      toolName: "file_search",
      arguments: { path: root, query, maxResults: 20 },
      dependsOn: [],
    }],
  };
  const validation = validatePlan(discoveryPlan, this.aiFileTools);
  if (!validation.valid) {
    console.warn("[NEXA Discovery] Search rejected:", validation.message);
    return null;
  }

  console.log("[NEXA Discovery] Verifying a suggested location by read-only search.");
  return this.executeAIFilePlan(discoveryPlan, originalInstruction);
}

/** Classify a follow-up without interpreting free-form text as authorization. */
private async classifyPlannerClarificationReply(
  originalInstruction: string,
  question: string,
  reply: string
): Promise<"confirm" | "cancel" | "change" | "unclear"> {
  const model =
    process.env.OLLAMA_CONFIRMATION_MODEL?.trim() ||
    process.env.OLLAMA_PLANNER_MODEL?.trim() ||
    process.env.OLLAMA_AGENT_MODEL?.trim() ||
    "qwen3:8b";
  const result = await ollama.chat({
    model,
    messages: [
      {
        role: "system",
        content: [
          "Classify the user's answer to NEXA's pending clarification.",
          'Reply with JSON only: {"decision":"confirm|cancel|change|unclear"}.',
          "Confirm only for unambiguous acceptance of the question as stated.",
          "Cancel for rejection or cancellation.",
          "Change if the user proposes different paths, instructions, or a new task.",
          "Unclear if ambiguous or unrelated.",
          "You do not execute actions or grant permission to modify data.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ originalInstruction, question, reply }),
      },
    ],
    format: "json",
    stream: false,
    think: false,
    keep_alive: "20m",
    options: { temperature: 0, num_predict: 80, num_ctx: 2048 },
  });
  const parsed: unknown = JSON.parse(result.message.content || "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "unclear";
  const value = (parsed as { decision?: unknown }).decision;
  return value === "confirm" || value === "cancel" ||
    value === "change" || value === "unclear" ? value : "unclear";
}

/**
 * Execute only read-only Gmail proposals using the existing verified tool
 * definitions, validator and Executor. Sending mail is deliberately absent.
 * No Gmail payload is added to long-term memory.
 */
private async executeAIReadOnlyGmailPlan(
  decision: Extract<PlannerDecision, { kind: "plan" }>,
  userInput: string
): Promise<string> {
  const permitted = new Set(["gmail_recent", "gmail_search", "gmail_read"]);
  if (decision.steps.length !== 1) {
    return "This Gmail request needs a tool result before the next action can be planned. " +
      "Please ask for one Gmail search or read at a time. No action was executed.";
  }

  const step = decision.steps[0];
  if (!permitted.has(step.toolName)) {
    return "Unsupported Gmail action. No action was executed.";
  }

  const validation = validateAgentToolCall(step.toolName, step.arguments);
  if (!validation.success) {
    return `Gmail tool parameters rejected: ${validation.message}. No action was performed.`;
  }

  const request = mapAgentToolCall(step.toolName, validation.args);
  if (!request || request.tool !== "gmail" ||
      !["recent", "search", "read"].includes(request.action)) {
    return "Gmail tool routing failed. No action was performed.";
  }

 console.log(
  "[NEXA Gmail AI]",
  step.toolName,
  "Arguments:",
  JSON.stringify(validation.args, null, 2)
);
  const result = await this.executor.execute(request);
  if (!result.success) {
    return this.isPermissionDenied(result)
      ? "Permission denied. Gmail was not accessed."
      : `Gmail request failed: ${String(result.message ?? "Unknown error")}`;
  }

  const formatted = this.formatDirectGmailResult(step.toolName, result, userInput);
  return formatted ?? "Gmail succeeded but returned an unexpected response format.";
}

private async tryAIFilePlan(userInput: string, confirmedQuestion?: string): Promise<string | null> {

  const decision = await this.aiPlanner.plan({

    instruction: userInput,

    history: this.messages.slice(0, -1).filter(

      (message) => message.role === "user" || message.role === "assistant"

    ),

    tools: [...this.aiFileTools, ...this.aiReadOnlyGmailTools],

    taskContext: [
      this.aiTaskContext.getContextForPlanner(),
      "Trusted discovery roots for file_search: " + this.fileDiscoveryRoots.join(", "),
      "A folder mentioned only by name can be discovered within an authorized root. " +
        "Search results become trusted paths only after a tool verifies them. " +
        "Normal path confirmation, permission checks and preflight still apply.",
      "For the user's actual Gmail account, use gmail_recent, gmail_search or gmail_read. " +
        "Never use file_search, file_list_files or any other filesystem tool for an email request. " +
        "Gmail data is not stored at a Windows path. Gmail searches require a Gmail search query, " +
        "not a Windows directory.",
    ].join("\n"),

  });



  if (decision.kind === "error") {

    console.error("[NEXA File Planner]", decision.message);

    return `AI planning failed: ${decision.message}\nNo file operation was performed.`;

  }



  // Non-file conversation still uses the original Gmail/Browser/chat flow.

  if (decision.kind === "response") return null;

  if (decision.kind === "clarification") {
    // Models may guess a path and ask the user to confirm it rather than
    // calling file_search. Do not trust the guess. Prefer verified discovery
    // of a user-mentioned name within an explicitly authorized search root.
    const discovered = await this.tryGroundedDiscoveryFromClarification(
      userInput, decision.question
    );
    if (discovered !== null) return discovered;

    // A clarification already answered by the user must never loop forever.
    if (confirmedQuestion) {
      return "The path was confirmed, but the planner still could not choose a valid action. " +
        "No further file operation was performed. Please provide the exact operation and path.";
    }

    // Save the original request for the next user turn. The TaskContext
    // prompt alone is not a pending clarification and cannot resume a task.
    this.pendingPlannerClarification = {
      originalInstruction: userInput,
      question: decision.question,
      startedAt: Date.now(),
    };
    return decision.question;
  }



  // A read-only Gmail proposal is executed with the Gmail validator and
  // Executor, never with FileTool or filesystem path confirmation.
  const proposedGmailSteps = decision.steps.filter((step) =>
    step.toolName.startsWith("gmail_")
  );
  if (proposedGmailSteps.length > 0) {
    if (proposedGmailSteps.length !== decision.steps.length) {
      return "The planner mixed Gmail and file operations. No action was performed.";
    }
    return this.executeAIReadOnlyGmailPlan(decision, userInput);
  }

  // Validate EVERY step and its concrete arguments BEFORE any work begins.

  // PlanValidator holds the canonical file-tool path policy for all 15 actions.

  const validation = validatePlan(decision, this.aiFileTools);

  if (!validation.valid) {

    return `File plan rejected: ${validation.message}. No file operation was performed.`;

  }



  const validatedDecision: Extract<PlannerDecision, { kind: "plan" }> = {

    kind: "plan",

    goal: validation.plan.goal,

    steps: validation.plan.steps.map((step) => ({

      id: step.id,

      toolName: step.toolName,

      arguments: { ...step.arguments },

      dependsOn: [...step.dependsOn],

    })),

  };



  // The following is data provenance checking, not natural-language parsing.

  // Path references must be explicitly supplied, or obtained from earlier

  // verified tool results, or confirmed before execution.

  const canonical = (value: string) => nodePath.win32.normalize(value).toLowerCase();

  const normalizedInput = userInput.replace(/\//g, "\\").toLowerCase();

  const verifiedFacts = this.aiTaskContext.getSnapshot().facts.filter(

    (fact) => fact.source === "tool"

  );

  const verifiedPaths = new Set<string>(

    verifiedFacts

      .filter((fact) => nodePath.win32.isAbsolute(fact.value))

      .map((fact) => canonical(fact.value))

  );

  const verifiedRecoveryIds = new Set<string>(

    verifiedFacts

      .filter((fact) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(fact.value))

      .map((fact) => fact.value.toLowerCase())

  );



  const isGrounded = (target: string, extraParents: ReadonlySet<string>): boolean => {

    if (!nodePath.win32.isAbsolute(target)) return false;

    const absolute = canonical(target);

    if (normalizedInput.includes(absolute) || verifiedPaths.has(absolute)) return true;



    const basename = nodePath.win32.basename(target).toLowerCase();

    const parent = canonical(nodePath.win32.dirname(target));

    // A derived child name is acceptable only when both its basename and

    // its parent are grounded; do not let AI invent filenames or directories.

    return !!basename && normalizedInput.includes(basename) &&

      (normalizedInput.includes(parent) ||

       verifiedPaths.has(parent) || extraParents.has(parent));

  };



  const plannedParents = new Set<string>();

  let needsPathConfirmation = false;



  for (const step of validatedDecision.steps) {

    if (step.toolName === "file_restore") {

      const id = step.arguments.recoveryId;

      if (typeof id !== "string" ||

          (!normalizedInput.includes(id.toLowerCase()) &&

           !verifiedRecoveryIds.has(id.toLowerCase()))) {

        return "Please provide the exact recovery ID from a previous NEXA " +

          "file operation. No restoration was performed.";

      }

      continue;

    }



    // PlanValidator already checked required fields; inspect ALL path

    // arguments, including copy operations and any future file actions.

    const fields = ["path", "oldPath", "newPath"].filter(

      (field) => Object.prototype.hasOwnProperty.call(step.arguments, field)

    );

    if (fields.length === 0) {

      return `File plan rejected: ${step.toolName} has no path policy.`;

    }



    const extraParents = new Set(plannedParents);

    const source = step.arguments.oldPath;

    if (typeof source === "string" && isGrounded(source, extraParents)) {

      extraParents.add(canonical(nodePath.win32.dirname(source)));

    }



    for (const field of fields) {

      const target = step.arguments[field];

      if (typeof target !== "string" || !nodePath.win32.isAbsolute(target)) {

        return `Invalid absolute Windows ${field}. No file action was performed.`;

      }

      // Authorized discovery roots are grounded for searches only. This
      // does not authorize file edits or searches of arbitrary directories.
      const trustedDiscoveryRoot =
        step.toolName === "file_search" && field === "path" &&
        this.fileDiscoveryRoots.some((root) => canonical(root) === canonical(target)) &&
        typeof step.arguments.query === "string" &&
        step.arguments.query.trim().length > 0 &&
        normalizedInput.includes(step.arguments.query.trim().toLowerCase());
      if (!trustedDiscoveryRoot && !isGrounded(target, extraParents)) {
        needsPathConfirmation = true;
      }

    }



    // A folder newly created earlier in this plan may be used as a

    // destination's parent, subject to the same filename grounding rule.

    if (step.toolName === "file_create_folder" &&

        typeof step.arguments.path === "string") {

      plannedParents.add(canonical(step.arguments.path));

    }

  }



  if (needsPathConfirmation) {

    // Explicit path confirmation DOES NOT authorize editing or deletion.

    // Executor -> PermissionManager still separately requests approval.

    return this.pendingFileConfirmation.set(validatedDecision, userInput);

  }



  return this.executeAIFilePlan(validatedDecision, userInput);

}



/** Execute only a validated file plan, including plans resumed after clarification. */

private async executeAIFilePlan(

  decision: Extract<PlannerDecision, { kind: "plan" }>,

  userInput: string,

  readOnlyFollowUpsRemaining = 1

): Promise<string> {

  const permitted = new Set<string>(

    this.aiFileTools

      .map((tool) => tool.function?.name)

      .filter((name): name is string => typeof name === "string")

  );

  const runner = new TaskRunner(this.executor, this.aiTaskContext, this.aiFileTools);

  const outcome = await runner.run(decision, { allowedToolNames: permitted });



  // Only trust successful and independently verified tool results.

  // Recovery IDs enable later undo/restore without guessing identifiers.

  const canonical = (value: string) => nodePath.win32.normalize(value).toLowerCase();

  const destinationTools = new Set([

    "file_rename", "file_move", "file_copy_file", "file_copy_folder",

  ]);



  for (const result of outcome.results) {

    if (!result.success) continue;

    const original = decision.steps.find((step) => step.id === result.stepId);

    if (!original) continue;

    const data = result.data;

    if (!data || typeof data !== "object" || Array.isArray(data)) continue;

    const details = data as Record<string, unknown>;



    if (typeof details.recoveryId === "string") {

      this.aiTaskContext.setFact("lastRecoveryId", details.recoveryId, "tool");

    }



    if (result.toolName === "file_delete_file" || result.toolName === "file_delete_folder") {

      // A deleted path must not be saved as an existing target.

      continue;

    }

    if (result.toolName === "file_exists" && details.exists !== true) continue;



    if (result.toolName === "file_search") {

      const matches = details.items;

      if (Array.isArray(matches) && matches.length === 1) {

        const first = matches[0];

        if (first && typeof first === "object" && !Array.isArray(first)) {

          const hit = (first as Record<string, unknown>).path;

          if (typeof hit === "string" && nodePath.win32.isAbsolute(hit)) {

            this.aiTaskContext.setFact("lastVerifiedPath", hit, "tool");

          }

        }

      }

      // Multiple search matches are ambiguous: don't invent a selection.

    }



    const candidate = destinationTools.has(result.toolName)

      ? details.newPath

      : details.path;

    const expected = destinationTools.has(result.toolName)

      ? original.arguments.newPath

      : original.arguments.path;



    if (typeof candidate !== "string" || !nodePath.win32.isAbsolute(candidate)) continue;

    if (result.toolName !== "file_restore") {

      if (typeof expected !== "string" || canonical(candidate) !== canonical(expected)) continue;

    }



    this.aiTaskContext.setFact("lastVerifiedPath", candidate, "tool");

    if (result.toolName === "file_list_files" ||

        result.toolName === "file_create_folder") {

      this.aiTaskContext.setFact("currentDirectory", candidate, "tool");

    }

  }



  // Continue a discovery request when the user also asked for information
  // about the discovered item. The AI chooses the next read-only tool;
  // code never matches user sentences or special folder names.
  //
  // This runs AFTER the first validated tool has completed and its verified
  // result has been stored in TaskContext. It also runs after a user confirms
  // a search path, because that flow calls executeAIFilePlan directly.
  // Never infer a destination, mutate files, or bypass TaskRunner permissions.
  if (
    readOnlyFollowUpsRemaining > 0 &&
    outcome.success &&
    decision.steps.length === 1 &&
    decision.steps[0].toolName === "file_search"
  ) {
    const completedSearch = outcome.results.find(
      (result) => result.success && result.toolName === "file_search"
    );
    const searchData = completedSearch?.data;

    if (
      searchData &&
      typeof searchData === "object" &&
      !Array.isArray(searchData)
    ) {
      const searchDetails = searchData as Record<string, unknown>;
      const items = searchDetails.items;

      // A single verified match can safely be inspected. Multiple matches
      // remain ambiguous, so the original search results are returned.
      if (Array.isArray(items) && items.length === 1) {
        const firstItem = items[0];
        const foundPath =
          firstItem &&
          typeof firstItem === "object" &&
          !Array.isArray(firstItem)
            ? (firstItem as Record<string, unknown>).path
            : null;

        if (typeof foundPath === "string" && nodePath.win32.isAbsolute(foundPath)) {
          const continuationNames = new Set([
            "file_list_files",
            "file_read_file",
            "file_exists",
          ]);

          const continuationTools = this.aiFileTools.filter(
            (tool) => continuationNames.has(tool.function?.name ?? "")
          );

          if (continuationTools.length > 0) {
            try {
              const decisionAfterSearch = await this.aiPlanner.plan({
                instruction: [
                  "Continue the remaining parts of the original user request.",
                  `Original user request: ${userInput}`,
                  "The requested file search has already completed successfully.",
                  `Verified search result: ${JSON.stringify({ path: foundPath })}`,
                  "Do not repeat the search or claim to have read contents yet.",
                  "Use an available read-only tool on this exact verified path ONLY if the original request requires further information about it.",
                  "Otherwise return a conversational reply without a tool action.",
                ].join("\n"),
                history: this.messages.slice(0, -1).filter(
                  (message) => message.role === "user" || message.role === "assistant"
                ),
                tools: continuationTools,
                taskContext: this.aiTaskContext.getContextForPlanner(),
              });

              if (
                decisionAfterSearch.kind === "plan" &&
                decisionAfterSearch.steps.length === 1
              ) {
                const nextStep = decisionAfterSearch.steps[0];
                const nextPath = nextStep.arguments.path;
                const sameVerifiedPath =
                  typeof nextPath === "string" &&
                  nodePath.win32.isAbsolute(nextPath) &&
                  canonical(nextPath) === canonical(foundPath);

                if (
                  continuationNames.has(nextStep.toolName) &&
                  sameVerifiedPath
                ) {
                  const followUpValidation = validatePlan(
                    decisionAfterSearch,
                    continuationTools
                  );

                  if (followUpValidation.valid) {
                    const nextPlan: Extract<PlannerDecision, { kind: "plan" }> = {
                      kind: "plan",
                      goal: decisionAfterSearch.goal,
                      steps: followUpValidation.plan.steps.map((step) => ({
                        id: step.id,
                        toolName: step.toolName,
                        arguments: { ...step.arguments },
                        dependsOn: [...step.dependsOn],
                      })),
                    };

                    // The second step must still go through TaskRunner,
                    // Executor, PermissionManager, and the file-tool preflight.
                    // A zero budget prevents loops or duplicate operations.
                    return await this.executeAIFilePlan(nextPlan, userInput, 0);
                  }
                  console.warn(
                    "[NEXA File Follow-Up] Plan validation failed:",
                    followUpValidation.message
                  );
                } else {
                  console.warn(
                    "[NEXA File Follow-Up] Rejected non-read-only or unverified path."
                  );
                }
              }
            } catch (error) {
              // Discovery already succeeded. Do not erase that verified
              // result just because optional AI continuation was unavailable.
              console.warn("[NEXA File Follow-Up] Planner failed:", error);
            }
          }
        }
      }
    }
  }

  // Present exact operation results and recovery IDs; do not let a model

  // paraphrase a failed write/delete as a successful one.

  const readOnly = new Set(["file_list_files", "file_read_file", "file_exists", "file_search"]);

  const mutating = decision.steps.some((step) => !readOnly.has(step.toolName));

  if (mutating) {

    const lines = outcome.results.map((result) => {

      const data = result.data && typeof result.data === "object" && !Array.isArray(result.data)

        ? result.data as Record<string, unknown>

        : {};

      const recovery = typeof data.recoveryId === "string"

        ? `\nRecovery ID: ${data.recoveryId}`

        : "";

      return `${result.success ? "Completed" : "Failed"} [${result.toolName}]: ${result.message}${recovery}`;

    });

    if (!outcome.success) {

      lines.push(`Task stopped: ${outcome.message}`);

      if (outcome.completedSteps > 0) {

        lines.push("Earlier successful changes were not automatically rolled back.");

      }

    }

    return lines.length ? lines.join("\n\n") : outcome.message;

  }



  // Search results are structured filesystem evidence; format their actual

  // returned paths without asking a generative model to invent a summary.

  if (outcome.success && outcome.results.length === 1 &&

      outcome.results[0].toolName === "file_search") {

    const data = outcome.results[0].data;

    if (data && typeof data === "object" && !Array.isArray(data)) {

      const details = data as Record<string, unknown>;

      if (Array.isArray(details.items)) {

        const paths = details.items

          .filter((item): item is { path: string } =>

            !!item && typeof item === "object" &&

            typeof (item as { path?: unknown }).path === "string"

          )

          .map((item) => item.path);

        const suffix = details.truncated === true

          ? "\nResults may be incomplete; narrow the search if needed."

          : "";

        return paths.length

          ? `Found ${paths.length} matching items:\n${paths.join("\n")}${suffix}`

          : `No matching items were found.${suffix}`;

      }

    }

  }



  return this.resultInterpreter.interpret({

    userRequest: userInput,

    run: outcome,

    mode: "auto",

  });

}



async run(userInput: string): Promise<string> {



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



  // A reply to a pending path confirmation is handled against the SAVED

  // plan, not sent back to Planner as a fresh unrelated instruction.

  if (this.pendingFileConfirmation.hasPending()) {

    const followUp = await this.pendingFileConfirmation.resolve(userInput);

    if (followUp.kind === "confirmed") {

      const answer = await this.executeAIFilePlan(

        followUp.plan,

        followUp.originalInstruction

      );

      return this.generatedPrivateFinalAnswer(answer);

    }

    if (followUp.kind !== "none") {

      return this.generatedPrivateFinalAnswer(followUp.message);

    }

  }

  // The previous planner may have asked a clarification WITHOUT producing
  // a validated plan. Keep that question and its request across turns.
  if (this.pendingPlannerClarification) {
    const pending = this.pendingPlannerClarification;
    if (Date.now() - pending.startedAt > this.plannerClarificationLifetimeMs) {
      this.pendingPlannerClarification = null;
      return this.generatedPrivateFinalAnswer(
        "The earlier clarification expired. Please repeat your full request."
      );
    }

    let decision: "confirm" | "cancel" | "change" | "unclear" = "unclear";
    try {
      decision = await this.classifyPlannerClarificationReply(
        pending.originalInstruction, pending.question, userInput
      );
    } catch (error) {
      console.warn("[NEXA Clarification] Classification failed:", error);
      return this.generatedPrivateFinalAnswer(
        "I couldn't verify your confirmation. No action was performed.\n" + pending.question
      );
    }

    if (decision === "cancel") {
      this.pendingPlannerClarification = null;
      return this.generatedPrivateFinalAnswer("Cancelled. No file action was performed.");
    }
    if (decision === "change") {
      this.pendingPlannerClarification = null;
      return this.generatedPrivateFinalAnswer(
        "The earlier request was discarded. Please provide the complete updated instruction."
      );
    }
    if (decision === "unclear") {
      return this.generatedPrivateFinalAnswer(pending.question);
    }

    // Accepted clarification is not approval to write/delete. The planner
    // must still propose a tool, PlanValidator checks it, and Executor
    // independently enforces allowed roots and mutating-action approval.
    this.pendingPlannerClarification = null;
    const clarifiedInstruction = [
      pending.originalInstruction,
      "The user confirmed this clarification without changing it:",
      pending.question,
      "Use the confirmed information to propose the requested tool action.",
      "Do not ask the identical clarification again.",
    ].join("\n");
    const answer = await this.tryAIFilePlan(clarifiedInstruction, pending.question);
    return this.generatedPrivateFinalAnswer(
      answer ?? "The planner did not select a file tool. No file action was performed."
    );
  }

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

    detectBrowserRequirement(

      userInput

    ) ??

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

    // The central AI planner is evaluated before legacy file patterns.

    // All registered file tools go through validation, preflight and permissions.

    // Non-file requests retain the existing Gmail/Browser/terminal behavior.

    const exclusivelyNonFileTask = !!toolRequirement &&

      toolRequirement.toolNames.length > 0 &&

      toolRequirement.toolNames.every((name) => !name.startsWith("file_"));

    // A Gmail read/search should reach the shared AI planner even when the
    // legacy detector recognizes it as a non-file task. Other non-file tasks
    // retain their previous workflow; sending email still requires approval.
    const isReadOnlyGmailRequirement = !!toolRequirement &&
      toolRequirement.toolNames.length > 0 &&
      toolRequirement.toolNames.every((name) =>
        ["gmail_recent", "gmail_search", "gmail_read"].includes(name)
      );

    if (!resolvedGmailDraft && gmailCompose.kind === "none" &&
        (!exclusivelyNonFileTask || isReadOnlyGmailRequirement)) {

      const aiResult = await this.tryAIFilePlan(userInput);

      if (aiResult !== null) {

        return this.generatedPrivateFinalAnswer(aiResult);

      }

    }



    const fastGmailAnswer = await this.tryFastGmailCommand(userInput);

    if (fastGmailAnswer !== null) return fastGmailAnswer;

    const fastBrowserAnswer = await this.tryFastBrowserCommand(userInput);

    if (fastBrowserAnswer !== null) return fastBrowserAnswer;

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

            ? allAgentTools

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

          validateAgentToolCall(

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

          `\n🔧 Agent tool call: ${toolName}`

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

        MAP AGENT TOOL

        ======================================

        */

        const request =

          mapAgentToolCall(

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

           HUMAN-READABLE WEBSITE SUMMARY

           ====================================

           Preserve raw-text requests and

           allow multi-site workflows to

           continue through the agent loop.

           */

          if (toolName === "browser_read_page") {

            const page = result.data as

              | { title?: string; url?: string; text?: string }

              | undefined;

            const wantsRawText =

              /\b(raw text|exact text|full text|verbatim|extract all text|copy all text|show all text)\b/i.test(userInput);

            const wantsAnalysis =

              /\b(summarize|summary|explain|analyze|review|read|what is|what does|tell me about|describe)\b/i.test(userInput);

            const isMultiPageTask =

              /\b(compare|multiple websites|several websites|all websites|research [0-9]+|visit [0-9]+|each website|both websites)\b/i.test(userInput);

            if (

              wantsAnalysis &&

              !wantsRawText &&

              !isMultiPageTask &&

              typeof page?.title === "string" &&

              typeof page.url === "string" &&

              typeof page.text === "string" &&

              page.text.trim().length > 0

            ) {

              try {

                const summary = await summarizeBrowserPage(

                  { title: page.title, url: page.url, text: page.text },

                  userInput

                );

                return this.generatedFinalAnswer(summary);

              } catch (error) {

                console.error("Website summary failed:", error);

                // Existing agent flow provides a fallback answer.

              }

            }

          }

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

    this.aiTaskContext.reset();

    this.pendingFileConfirmation = new PendingFileConfirmation();
    this.pendingPlannerClarification = null;

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
