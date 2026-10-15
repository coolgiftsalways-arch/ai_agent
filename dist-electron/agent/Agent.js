import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import { TerminalTool } from "../tools/TerminalTool.js";
import { allAgentTools, mapAgentToolCall, validateAgentToolCall, } from "../tools/AgentToolRouter.js";
import { BrowserTool } from "../tools/BrowserTool.js";
import { buildSystemPrompt } from "../prompts/systemPrompt.js";
import { PermissionManager } from "../security/PermissionManager.js";
import { askForApproval } from "../security/ConsoleApproval.js";
import { MemoryTool } from "../tools/MemoryTool.js";
import { MemoryManager } from "../memory/MemoryManager.js";
import { GmailTool } from "../tools/GmailTool.js";
import { Executor } from "./Executor.js";
import { detectToolRequirement, } from "./ToolRequirementDetector.js";
import { detectBrowserRequirement } from "./BrowserRequirementDetector.js";
import { GmailComposeManager, } from "./GmailComposeManager.js";
import { getCapabilityResponse, } from "./CapabilityResponder.js";
import { summarizeBrowserPage, } from "../browser/BrowserSummarizer.js";
export class Agent {
    executor;
    messages;
    memoryManager;
    gmailComposeManager;
    constructor(approvalFunction = askForApproval) {
        /*
    
        ==========================================
    
        PERMISSIONS
    
        ==========================================
    
        */
        const permissionManager = new PermissionManager(approvalFunction);
        /*
    
        ==========================================
    
        EXECUTOR
    
        ==========================================
    
        */
        this.executor =
            new Executor(permissionManager);
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
        const fileTool = new FileTool([
            process.cwd(),
            "S:\\\\",
        ]);
        const terminalTool = new TerminalTool([
            process.cwd(),
            "S:\\\\",
        ]);
        const memoryTool = new MemoryTool(this.memoryManager);
        const gmailTool = new GmailTool();
        const browserTool = new BrowserTool();
        this.executor.registerTool(fileTool);
        this.executor.registerTool(terminalTool);
        this.executor.registerTool(memoryTool);
        this.executor.registerTool(gmailTool);
        this.executor.registerTool(browserTool);
        /*
    
        ==========================================
    
        START CONVERSATION
    
        ==========================================
    
        */
        this.messages = [
            {
                role: "system",
                content: buildSystemPrompt(),
            },
        ];
    }
    /*
  
    ==========================================
  
    EXACT FILE CONTENT
  
    ==========================================
  
    */
    extractExactFileContent(userInput) {
        const matches = Array.from(userInput.matchAll(/\bcontent(?:s)?\s+to\s+/gi));
        if (matches.length !==
            1) {
            return null;
        }
        const match = matches[0];
        const start = (match.index ?? 0) +
            match[0].length;
        let content = userInput
            .slice(start)
            .trim();
        if (!content) {
            return null;
        }
        const first = content[0];
        const last = content[content.length - 1];
        if (content.length >= 2 &&
            first === last &&
            (first === '"' ||
                first === "'" ||
                first === "`")) {
            content =
                content.slice(1, -1);
        }
        return content;
    }
    /*
  
    ==========================================
  
    PERMISSION DENIED
  
    ==========================================
  
    */
    isPermissionDenied(result) {
        if (result.success) {
            return false;
        }
        const message = String(result.message ??
            "").toLowerCase();
        return (message.includes("permission denied") ||
            message.includes("permission was denied") ||
            message.includes("not approved") ||
            message.includes("user denied") ||
            message.includes("approval denied"));
    }
    /*
  
    ==========================================
  
    PATH SECURITY DENIED
  
    ==========================================
  
    */
    isPathSecurityDenied(result) {
        if (result.success) {
            return false;
        }
        const message = String(result.message ??
            "").toLowerCase();
        return (message.includes("access denied") &&
            (message.includes("outside allowed") ||
                message.includes("allowed folders")));
    }
    /*
  
    ==========================================
  
    TERMINAL FALLBACK SECURITY
  
    ==========================================
  
    */
    isBlockedTerminalFallback(toolName, requirement) {
        if (toolName !==
            "terminal_run" ||
            !requirement) {
            return false;
        }
        return (requirement.description ===
            "file_list_files" ||
            requirement.description ===
                "file_read_file" ||
            requirement.description ===
                "file_exists");
    }
    /*
  
    ==========================================
  
    REQUIREMENT CHECK
  
    ==========================================
  
    */
    requirementSatisfied(requirement, successfulTools) {
        if (!requirement) {
            return true;
        }
        return requirement
            .toolNames
            .some((toolName) => successfulTools.has(toolName));
    }
    /*
  
    ==========================================
  
    SAVE NORMAL FINAL ANSWER
  
    ==========================================
  
    */
    saveFinalAnswer(answer) {
        this.memoryManager.remember("assistant", answer);
        return answer;
    }
    /*
  
    ==========================================
  
    GENERATED FINAL ANSWER
  
    ==========================================
  
    */
    generatedFinalAnswer(answer) {
        const message = {
            role: "assistant",
            content: answer,
        };
        this.messages.push(message);
        this.memoryManager.remember("assistant", answer);
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
    generatedPrivateFinalAnswer(answer) {
        const message = {
            role: "assistant",
            content: answer,
        };
        this.messages.push(message);
        return answer;
    }
    /*
  
    ==========================================
  
    ADD TOOL MESSAGE
  
    ==========================================
  
    */
    addToolMessage(runMessages, toolName, payload) {
        const toolMessage = {
            role: "tool",
            tool_name: toolName,
            content: JSON.stringify(payload),
        };
        runMessages.push(toolMessage);
        this.messages.push(toolMessage);
    }
    /*
  
    ==========================================
  
    CLEAN GMAIL TEXT
  
    ==========================================
  
    */
    cleanGmailText(value, preserveLineBreaks = false) {
        let text = String(value ??
            "");
        /*
    
        Remove tracking-style links:
    
        <https\\\\://very-long-link>Google
    
        becomes:
    
        Google
    
        */
        text =
            text.replace(/<https?:\/\/[^>]+>/gi, "");
        /*
    
        Decode common HTML entities.
    
        */
        text =
            text
                .replace(/&#39;/gi, "'")
                .replace(/&#x27;/gi, "'")
                .replace(/&apos;/gi, "'")
                .replace(/&quot;/gi, '"')
                .replace(/&nbsp;/gi, " ")
                .replace(/&lt;/gi, "<")
                .replace(/&gt;/gi, ">")
                .replace(/&amp;/gi, "&");
        /*
    
        Remove invisible email characters.
    
        */
        text =
            text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");
        if (preserveLineBreaks) {
            return text
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n")
                .replace(/[ \t]+\n/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
        }
        return text
            .replace(/\s+/g, " ")
            .trim();
    }
    /*
  
    ==========================================
  
    FORMAT DIRECT GMAIL RESULTS
  
    ==========================================
  
    */
    formatDirectGmailResult(toolName, result, userInput) {
        if (!result.success ||
            ![
                "gmail_recent",
                "gmail_search",
                "gmail_read",
            ].includes(toolName)) {
            return null;
        }
        if (!result.data ||
            typeof result.data !==
                "object" ||
            Array.isArray(result.data)) {
            return null;
        }
        const data = result.data;
        /*
    
        ========================================
    
        GMAIL READ
    
        ========================================
    
        */
        if (toolName ===
            "gmail_read") {
            const id = String(data.id ??
                "");
            const from = this.cleanGmailText(data.from);
            const to = this.cleanGmailText(data.to);
            const subject = this.cleanGmailText(data.subject ??
                "(No subject)");
            const date = this.cleanGmailText(data.date);
            const body = this.cleanGmailText(data.body ??
                data.snippet ??
                "", true);
            const lines = [
                subject,
            ];
            if (from) {
                lines.push(`From: ${from}`);
            }
            if (to) {
                lines.push(`To: ${to}`);
            }
            if (date) {
                lines.push(`Date: ${date}`);
            }
            if (id) {
                lines.push(`Gmail ID: ${id}`);
            }
            if (body) {
                lines.push("", body);
            }
            return lines.join("\n");
        }
        /*
    
        ========================================
    
        GMAIL RECENT / SEARCH
    
        ========================================
    
        */
        const rawEmails = data.emails;
        if (!Array.isArray(rawEmails)) {
            return null;
        }
        if (rawEmails.length ===
            0) {
            return toolName ===
                "gmail_search"
                ? "No matching emails were found."
                : "No recent emails were found.";
        }
        const wantsIds = /\b(?:gmail\s+)?(?:message\s+)?ids?\b/i
            .test(userInput);
        const emails = rawEmails.map((email, index) => {
            if (!email ||
                typeof email !==
                    "object" ||
                Array.isArray(email)) {
                return `${index + 1}. Email`;
            }
            const item = email;
            const subject = this.cleanGmailText(item.subject ??
                "(No subject)");
            const from = this.cleanGmailText(item.from);
            const date = this.cleanGmailText(item.date);
            const snippet = this.cleanGmailText(item.snippet);
            const id = String(item.id ??
                "");
            const lines = [
                `${index + 1}. ${subject}`,
            ];
            if (from) {
                lines.push(`From: ${from}`);
            }
            if (date) {
                lines.push(`Date: ${date}`);
            }
            if (wantsIds &&
                id) {
                lines.push(`Gmail ID: ${id}`);
            }
            if (snippet) {
                lines.push(`Snippet: ${snippet}`);
            }
            return lines.join("\n");
        });
        const heading = toolName ===
            "gmail_recent"
            ? `Here are your latest ${rawEmails.length} emails:`
            : `Found ${rawEmails.length} matching emails:`;
        return (`${heading}\n\n` +
            emails.join("\n\n"));
    }
    /*
  
    ==========================================
  
    GMAIL SEND SUCCESS
  
    ==========================================
  
    */
    buildGmailSendSuccess(result, args) {
        const data = result.data &&
            typeof result.data ===
                "object" &&
            !Array.isArray(result.data)
            ? result.data
            : {};
        const to = String(data.to ??
            args.to ??
            "");
        const subject = String(data.subject ??
            args.subject ??
            "");
        const id = String(data.id ??
            "");
        const lines = [
            "✅ Email sent successfully.",
        ];
        if (to) {
            lines.push(`To: ${to}`);
        }
        if (subject) {
            lines.push(`Subject: ${subject}`);
        }
        if (id) {
            lines.push(`Gmail ID: ${id}`);
        }
        return lines.join("\n");
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
    async tryFastBrowserCommand(userInput) {
        const input = userInput.trim();
        let toolName = null;
        let args = {};
        let summarize = false;
        // URL opening, optionally followed by a homepage summary.
        const openMatch = input.match(/^(?:please\s+)?(?:open|visit|go\s+to|navigate\s+to)\s+(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)(?:\s+(?:and\s+)?(?:(?:give\s+me\s+)?(?:a\s+)?(?:short\s+)?(?:summary|summarize|describe)(?:\s+(?:its|the|this)\s+(?:homepage|page|website|site))?))?[.!?]?$/i);
        if (openMatch) {
            toolName = "browser_open";
            // Punctuation after a naked domain is not part of the URL.
            const url = openMatch[1].replace(/[.,!?]+$/, "");
            args = { url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
            summarize = /\b(summary|summarize|describe)\b/i.test(input);
        }
        else if (/^(?:please\s+)?(?:read|summarize|describe)(?:\s+(?:the|this|current))?\s+(?:webpage|website|page|site|homepage)(?:\s+(?:for\s+me))?[.!?]?$/i.test(input)) {
            toolName = "browser_read_page";
            summarize = /\b(summarize|describe)\b/i.test(input);
        }
        else if (/^(?:please\s+)?(?:what(?:'s| is)\s+the\s+(?:current\s+)?(?:page\s+)?(?:title|url)|(?:get|show)(?:\s+me)?\s+(?:the\s+)?(?:current\s+)?(?:page\s+)?(?:title|url|page\s+info|browser\s+info))[.!?]?$/i.test(input)) {
            toolName = "browser_get_info";
        }
        else if (/^(?:please\s+)?(?:go\s+back|browser\s+back|back)(?:\s+(?:one\s+)?page)?[.!?]?$/i.test(input)) {
            toolName = "browser_back";
        }
        else if (/^(?:please\s+)?(?:go\s+forward|browser\s+forward|forward)(?:\s+(?:one\s+)?page)?[.!?]?$/i.test(input)) {
            toolName = "browser_forward";
        }
        else if (/^(?:please\s+)?(?:reload|refresh)(?:\s+(?:the\s+)?(?:current\s+)?(?:page|website|browser))?[.!?]?$/i.test(input)) {
            toolName = "browser_reload";
        }
        else if (/^(?:please\s+)?close\s+(?:the\s+)?browser[.!?]?$/i.test(input)) {
            toolName = "browser_close";
        }
        if (!toolName)
            return null;
        const start = performance.now();
        const validation = validateAgentToolCall(toolName, args);
        if (!validation.success) {
            return this.generatedFinalAnswer(`Browser command rejected: ${validation.message}`);
        }
        const request = mapAgentToolCall(toolName, validation.args);
        if (!request)
            return this.generatedFinalAnswer("Unsupported browser action.");
        console.log(`[BrowserFastPath] ${toolName}`);
        const result = await this.executor.execute(request);
        if (!result.success) {
            console.warn("[BrowserFastPath] Failed:", result.message);
            return this.generatedFinalAnswer(this.isPermissionDenied(result)
                ? "Permission denied. The browser action was not performed."
                : `Browser action failed: ${String(result.message ?? "unknown error")}`);
        }
        let info = result.data;
        if (toolName === "browser_open" && summarize) {
            // Do NOT claim to have read the page if Playwright only opened it.
            // This second read gets its own validation and permission approval.
            const readValidation = validateAgentToolCall("browser_read_page", {});
            if (!readValidation.success) {
                return this.generatedFinalAnswer(`Page read validation failed: ${readValidation.message}`);
            }
            const readRequest = mapAgentToolCall("browser_read_page", readValidation.args);
            if (!readRequest)
                return this.generatedFinalAnswer("Page reading is unavailable.");
            const readResult = await this.executor.execute(readRequest);
            if (!readResult.success) {
                return this.generatedFinalAnswer(`Opened ${String(info?.url ?? args.url)} but could not read its content: ${String(readResult.message ?? "unknown error")}`);
            }
            info = readResult.data;
        }
        let answer;
        if (summarize) {
            if (!info?.text?.trim() || !info.url || info.url === "about:blank") {
                answer = "The browser action succeeded, but I could not read useful page content to summarize. Try again after the page finishes loading.";
            }
            else {
                try {
                    answer = await summarizeBrowserPage({ title: info.title ?? "", url: info.url, text: info.text }, userInput);
                }
                catch (error) {
                    answer = `The page was opened/read, but summarization failed: ${error instanceof Error ? error.message : String(error)}`;
                }
            }
        }
        else if (toolName === "browser_read_page") {
            answer = info?.text?.trim()
                ? `Page: ${info.title ?? ""}\nURL: ${info.url ?? ""}\n\n${info.text}`
                : "The browser returned no readable page text. It may still be loading or the tab may have closed.";
        }
        else if (toolName === "browser_get_info" || toolName === "browser_open") {
            answer = `${toolName === "browser_open" ? "Opened" : "Current page"}: ${info?.title || "(untitled)"}\nURL: ${info?.url ?? args.url ?? "unknown"}`;
        }
        else {
            answer = String(result.message ?? "Browser action completed.");
        }
        console.log(`[BrowserFastPath] Completed in ${((performance.now() - start) / 1000).toFixed(2)}s`);
        // Preserve tool result memory behavior for non-sensitive browsing actions.
        if (toolName !== "browser_close")
            this.memoryManager.rememberToolResult(toolName, result);
        return this.generatedFinalAnswer(answer);
    }
    async run(userInput) {
        /*
      
        ==========================================
      
        CURRENT USER MESSAGE
      
        ==========================================
      
        */
        const userMessage = {
            role: "user",
            content: userInput,
        };
        this.messages.push(userMessage);
        /*
      
        ==========================================
      
        KNOWN CAPABILITY RESPONSES
      
        ==========================================
      
        Do not ask the language model to guess
      
        what the local agent can actually do.
      
        ==========================================
      
        */
        const capabilityResponse = getCapabilityResponse(userInput);
        if (capabilityResponse) {
            return this
                .generatedPrivateFinalAnswer(capabilityResponse);
        }
        /*
      
        ==========================================
      
        DETECT REQUIRED TOOL
      
        ==========================================
      
        */
        const detectedToolRequirement = detectBrowserRequirement(userInput) ??
            detectToolRequirement(userInput);
        /*
      
        ==========================================
      
        GMAIL COMPOSE MANAGER
      
        ==========================================
      
        */
        const gmailCompose = this.gmailComposeManager
            .process(userInput, detectedToolRequirement
            ?.description ===
            "gmail_send");
        /*
    
        Gmail compose follow-up question.
    
        Example:
    
        Send an email
    
        ↓
    
        What email address should I send it to?
    
        */
        if (gmailCompose.kind ===
            "reply") {
            return this
                .generatedPrivateFinalAnswer(gmailCompose.message);
        }
        /*
    
        ==========================================
    
        COMPLETE GMAIL DRAFT
    
        ==========================================
    
        */
        const resolvedGmailDraft = gmailCompose.kind ===
            "ready"
            ? gmailCompose.draft
            : null;
        /*
    
        A finished Gmail draft becomes
    
        a required gmail_send action.
    
        */
        const toolRequirement = resolvedGmailDraft
            ? {
                toolNames: [
                    "gmail_send",
                ],
                description: "gmail_send",
            }
            : detectedToolRequirement;
        /*
    
        ==========================================
    
        EXACT FILE CONTENT
    
        ==========================================
    
        */
        const exactRequestedContent = this.extractExactFileContent(userInput);
        /*
    
        ==========================================
    
        LONG-TERM MEMORY
    
        ==========================================
    
        */
        const longTermMemory = this.memoryManager
            .getContextForPrompt(userInput);
        /*
    
        The current user message was already
    
        added to this.messages.
    
        Remove it temporarily so memory context
    
        can be inserted BEFORE the current user
    
        message.
    
        */
        const runMessages = [
            ...this.messages.slice(0, -1),
        ];
        if (longTermMemory) {
            runMessages.push({
                role: "system",
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
        runMessages.push(userMessage);
        /*
    
        ==========================================
    
        SAVE USER MEMORY
    
        ==========================================
    
        Gmail compose/send contents are NOT
    
        automatically written to SQLite memory.
    
        ==========================================
    
        */
        if (toolRequirement
            ?.description !==
            "gmail_send" &&
            gmailCompose.kind ===
                "none") {
            this.memoryManager
                .remember("user", userInput);
        }
        /*
    
        ==========================================
    
        AGENT LOOP STATE
    
        ==========================================
    
        */
        const fastBrowserAnswer = await this.tryFastBrowserCommand(userInput);
        if (fastBrowserAnswer !== null)
            return fastBrowserAnswer;
        const successfulTools = new Set();
        const successfulToolCalls = new Map();
        const MAX_STEPS = 30;
        let unresolvedToolFailure = false;
        let failureReminderCount = 0;
        let toolRequirementReminderCount = 0;
        /*
    
        ==========================================
    
        AGENT LOOP
    
        ==========================================
    
        */
        for (let step = 1; step <=
            MAX_STEPS; step++) {
            console.log(`\n🧠 Agent step ${step}/${MAX_STEPS}`);
            console.log("Thinking...");
            /*
      
            ========================================
      
            ASK OLLAMA
      
            Normal chat:
      
            qwen3:1.7b
      
            Real tool task:
      
            qwen3:8b
      
            ========================================
      
            */
            const response = await askOllama(runMessages, toolRequirement
                ? allAgentTools
                : [], toolRequirement
                ? "agent"
                : "chat");
            const assistantMessage = response.message;
            const toolCalls = assistantMessage
                .tool_calls ??
                [];
            runMessages.push(assistantMessage);
            /*
      
            ========================================
      
            NO TOOL CALL
      
            ========================================
      
            */
            if (toolCalls.length ===
                0) {
                /*
        
                Previous required tool failed.
        
                */
                if (unresolvedToolFailure) {
                    if (failureReminderCount <
                        2) {
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
                    return this
                        .generatedFinalAnswer("The requested action could not be completed because the required tool failed.");
                }
                /*
        
                ======================================
        
                REQUIRED TOOL GUARD
        
                ======================================
        
                */
                if (!this.requirementSatisfied(toolRequirement, successfulTools)) {
                    if (toolRequirementReminderCount <
                        2) {
                        runMessages.push({
                            role: "system",
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
                        .generatedFinalAnswer("I could not safely complete the request because the required tool was not executed.");
                }
                /*
        
                ======================================
        
                NORMAL FINAL ANSWER
        
                ======================================
        
                */
                const answer = assistantMessage
                    .content
                    ?.trim();
                if (answer) {
                    this.messages.push(assistantMessage);
                    return this
                        .saveFinalAnswer(answer);
                }
                if (successfulTools.size >
                    0) {
                    return this
                        .generatedFinalAnswer("Task completed successfully.");
                }
                return this
                    .generatedFinalAnswer("No action was completed.");
            }
            /*
      
            Tool-call assistant message
      
            becomes part of conversation.
      
            */
            this.messages.push(assistantMessage);
            let currentBatchFailed = false;
            let currentBatchSucceeded = false;
            /*
      
            ========================================
      
            PROCESS TOOL CALLS
      
            ========================================
      
            */
            for (const toolCall of toolCalls) {
                const toolName = toolCall.function.name;
                const rawArgs = toolCall.function
                    .arguments;
                /*
        
                ======================================
        
                BUILD CANDIDATE ARGUMENTS
        
                ======================================
        
                */
                let candidateArgs = rawArgs;
                if (rawArgs !==
                    null &&
                    typeof rawArgs ===
                        "object" &&
                    !Array.isArray(rawArgs)) {
                    const clonedArgs = {
                        ...rawArgs,
                    };
                    /*
          
                    ====================================
          
                    EXACT FILE CONTENT PROTECTION
          
                    ====================================
          
                    */
                    if (exactRequestedContent !==
                        null &&
                        (toolName ===
                            "file_write_file" ||
                            toolName ===
                                "file_create_file")) {
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
                if (toolName ===
                    "gmail_send") {
                    if (!resolvedGmailDraft) {
                        const blockedResult = {
                            success: false,
                            message: "gmail_send blocked because recipient, subject, and message were not completed by the Gmail compose flow.",
                        };
                        console.log("\n🛡️ Gmail send blocked:");
                        console.log(blockedResult);
                        this.addToolMessage(runMessages, toolName, blockedResult);
                        currentBatchFailed =
                            true;
                        continue;
                    }
                    candidateArgs = {
                        ...(candidateArgs &&
                            typeof candidateArgs ===
                                "object" &&
                            !Array.isArray(candidateArgs)
                            ? candidateArgs
                            : {}),
                        to: resolvedGmailDraft.to,
                        subject: resolvedGmailDraft.subject,
                        body: resolvedGmailDraft.body,
                    };
                }
                /*
        
                ======================================
        
                VALIDATE TOOL ARGUMENTS
        
                ======================================
        
                */
                const validation = validateAgentToolCall(toolName, candidateArgs);
                if (!validation.success) {
                    const validationResult = {
                        success: false,
                        message: validation.message,
                    };
                    console.log(`\n🛡️ Validation blocked: ${toolName}`);
                    console.log(validationResult);
                    this.addToolMessage(runMessages, toolName, validationResult);
                    currentBatchFailed =
                        true;
                    continue;
                }
                const args = validation.args;
                /*
        
                ======================================
        
                DUPLICATE SUCCESS PROTECTION
        
                ======================================
        
                */
                const toolCallKey = `${toolName}:${JSON.stringify(args)}`;
                const previousSuccessfulResult = successfulToolCalls.get(toolCallKey);
                if (previousSuccessfulResult) {
                    console.log(`\n♻️ Duplicate tool call blocked: ${toolName}`);
                    this.addToolMessage(runMessages, toolName, {
                        ...previousSuccessfulResult,
                        message: "This exact tool call already succeeded. Use the previous result and answer the user now. Do not call the same tool again with the same arguments.",
                        executedArguments: args,
                    });
                    runMessages.push({
                        role: "system",
                        content: "The exact same tool call already succeeded. Do NOT call it again. Use the successful result already provided and answer the user's request now.",
                    });
                    successfulTools.add(toolName);
                    continue;
                }
                console.log(`\n🔧 Agent tool call: ${toolName}`);
                console.log("Arguments:", args);
                /*
        
                ======================================
        
                BLOCK TERMINAL SECURITY WORKAROUND
        
                ======================================
        
                */
                if (this.isBlockedTerminalFallback(toolName, toolRequirement)) {
                    const blockedResult = {
                        success: false,
                        message: "Terminal fallback is not allowed for this file-system request. Use the required FileTool.",
                    };
                    console.log("\n🛡️ Security blocked:");
                    console.log(blockedResult);
                    this.addToolMessage(runMessages, toolName, blockedResult);
                    currentBatchFailed =
                        true;
                    continue;
                }
                /*
        
                ======================================
        
                MAP AGENT TOOL
        
                ======================================
        
                */
                const request = mapAgentToolCall(toolName, args);
                if (!request) {
                    const errorResult = {
                        success: false,
                        message: `Unknown tool: ${toolName}`,
                    };
                    this.addToolMessage(runMessages, toolName, errorResult);
                    currentBatchFailed =
                        true;
                    continue;
                }
                /*
        
                ======================================
        
                EXECUTE REAL TOOL
        
                ======================================
        
                */
                const result = await this.executor
                    .execute(request);
                console.log("\n🔧 Tool result:");
                console.log(result);
                /*
        
                Send tool result back to
        
                Qwen/context.
        
                */
                this.addToolMessage(runMessages, toolName, {
                    ...result,
                    executedArguments: args,
                });
                /*
        
                ======================================
        
                PERMISSION DENIED
        
                ======================================
        
                */
                if (this.isPermissionDenied(result)) {
                    if (toolName ===
                        "gmail_send") {
                        this.gmailComposeManager
                            .clear();
                    }
                    return this
                        .generatedFinalAnswer("Permission denied. The action was not performed.");
                }
                /*
        
                ======================================
        
                PATH SECURITY DENIED
        
                ======================================
        
                */
                if (this.isPathSecurityDenied(result)) {
                    return this
                        .generatedFinalAnswer(String(result.message));
                }
                /*
        
                ======================================
        
                SUCCESS
        
                ======================================
        
                */
                if (result.success) {
                    currentBatchSucceeded =
                        true;
                    successfulTools.add(toolName);
                    successfulToolCalls.set(toolCallKey, {
                        success: result.success,
                        message: result.message,
                        data: result.data,
                    });
                    /*
          
                     ====================================
          
                     HUMAN-READABLE WEBSITE SUMMARY
          
                     ====================================
          
                     Preserve raw-text requests and
          
                     allow multi-site workflows to
          
                     continue through the agent loop.
          
                     */
                    if (toolName === "browser_read_page") {
                        const page = result.data;
                        const wantsRawText = /\b(raw text|exact text|full text|verbatim|extract all text|copy all text|show all text)\b/i.test(userInput);
                        const wantsAnalysis = /\b(summarize|summary|explain|analyze|review|read|what is|what does|tell me about|describe)\b/i.test(userInput);
                        const isMultiPageTask = /\b(compare|multiple websites|several websites|all websites|research [0-9]+|visit [0-9]+|each website|both websites)\b/i.test(userInput);
                        if (wantsAnalysis &&
                            !wantsRawText &&
                            !isMultiPageTask &&
                            typeof page?.title === "string" &&
                            typeof page.url === "string" &&
                            typeof page.text === "string" &&
                            page.text.trim().length > 0) {
                            try {
                                const summary = await summarizeBrowserPage({ title: page.title, url: page.url, text: page.text }, userInput);
                                return this.generatedFinalAnswer(summary);
                            }
                            catch (error) {
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
                    if (toolName ===
                        "gmail_send") {
                        this.gmailComposeManager
                            .clear();
                        return this
                            .generatedPrivateFinalAnswer(this.buildGmailSendSuccess(result, args));
                    }
                    /*
          
                    ====================================
          
                    FAST GMAIL READ / SEARCH / RECENT
          
                    ====================================
          
                    */
                    if (toolName ===
                        "gmail_recent" ||
                        toolName ===
                            "gmail_search" ||
                        toolName ===
                            "gmail_read") {
                        const gmailAnswer = this.formatDirectGmailResult(toolName, result, userInput);
                        if (gmailAnswer) {
                            return this
                                .generatedPrivateFinalAnswer(gmailAnswer);
                        }
                    }
                    /*
          
                    Do not duplicate explicit
          
                    memory records or Gmail data
          
                    into general tool memory.
          
                    */
                    if (!toolName.startsWith("memory_") &&
                        !toolName.startsWith("gmail_")) {
                        this.memoryManager
                            .rememberToolResult(toolName, result);
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
            const requirementSatisfied = this.requirementSatisfied(toolRequirement, successfulTools);
            if (currentBatchFailed &&
                !requirementSatisfied) {
                unresolvedToolFailure =
                    true;
            }
            else if (currentBatchSucceeded) {
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
            .generatedFinalAnswer("The agent stopped because the maximum number of steps was reached.");
    }
    /*
  
    ==========================================
  
    RESET CONVERSATION
  
    ==========================================
  
    */
    resetConversation() {
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
                role: "system",
                content: buildSystemPrompt(),
            },
        ];
        console.log("🧠 Short-term conversation memory cleared.");
    }
}
