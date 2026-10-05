import { askOllama } from "../ollama/OllamaClient.js";

import { FileTool } from "../tools/FileTool.js";
import { TerminalTool } from "../tools/TerminalTool.js";

import { Executor } from "./Executor.js";

import { PermissionManager } from "../security/PermissionManager.js";
import { askForApproval } from "../security/ConsoleApproval.js";

import { buildSystemPrompt } from "../prompts/systemPrompt.js";

type AnswerDecision = {
  action: "answer";
  response: string;
};

type FileToolAction =
  | "createFolder"
  | "createFile"
  | "readFile"
  | "writeFile"
  | "listFiles"
  | "fileExists"
  | "renameFile"
  | "moveFile"
  | "deleteFile"
  | "deleteFolder";

type FileToolDecision = {
  action: "tool";
  tool: "file";
  toolAction: FileToolAction;
  parameters: Record<string, unknown>;
};

type TerminalToolDecision = {
  action: "tool";
  tool: "terminal";
  toolAction: "run";
  parameters: {
    command: string;
    cwd?: string;
  };
};

type AgentDecision =
  | AnswerDecision
  | FileToolDecision
  | TerminalToolDecision;

export class Agent {
  private executor: Executor;

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
  }

  /*
  ==========================================
  PARSE MODEL RESPONSE
  ==========================================
  */

  private parseDecision(
    rawResponse: string
  ): AgentDecision | null {
    const cleaned =
      rawResponse
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const start =
      cleaned.indexOf("{");

    if (start === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (
      let i = start;
      i < cleaned.length;
      i++
    ) {
      const char =
        cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString =
          !inString;

        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth++;
      }

      if (char === "}") {
        depth--;

        if (depth === 0) {
          const jsonText =
            cleaned.slice(
              start,
              i + 1
            );

          try {
            const parsed =
              JSON.parse(
                jsonText
              );

            /*
            --------------------------
            FINAL ANSWER
            --------------------------
            */

            if (
              parsed.action === "answer" &&
              typeof parsed.response ===
                "string"
            ) {
              return {
                action: "answer",
                response:
                  parsed.response,
              };
            }

            /*
            --------------------------
            TOOL CALL
            --------------------------
            */

            if (
              parsed.action === "tool" &&
              (
                parsed.tool === "file" ||
                parsed.tool ===
                  "terminal"
              ) &&
              typeof parsed.toolAction ===
                "string" &&
              parsed.parameters &&
              typeof parsed.parameters ===
                "object"
            ) {
              return (
                parsed as AgentDecision
              );
            }

            console.log(
              "\n⚠️ Model returned JSON but used the wrong schema."
            );

            console.log(parsed);

            return null;
          } catch {
            console.log(
              "\n❌ Invalid JSON:"
            );

            console.log(
              jsonText
            );

            return null;
          }
        }
      }
    }

    return null;
  }

  /*
  ==========================================
  RUN AGENT
  ==========================================
  */

  async run(
    userInput: string
  ): Promise<string> {

    /*
    ========================================
    BUILD PROMPT
    ========================================
    */

    let conversationHistory =
      buildSystemPrompt(
        userInput
      );

    /*
    ========================================
    AGENT LOOP
    ========================================
    */

    const MAX_STEPS = 30;

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

      const rawResponse =
        await askOllama(
          conversationHistory
        );

      console.log(
        "\n🤖 Model decision:"
      );

      console.log(
        rawResponse
      );

      /*
      ----------------------------------------
      PARSE RESPONSE
      ----------------------------------------
      */

      const decision =
        this.parseDecision(
          rawResponse
        );

      /*
      ----------------------------------------
      INVALID RESPONSE
      ----------------------------------------
      */

      if (!decision) {
        console.log(
          "\n⚠️ Invalid agent response format."
        );

        console.log(
          "Asking model to correct itself..."
        );

        conversationHistory += `


==================================================
FORMAT ERROR
==================================================

Your previous response was:

${rawResponse}

That response is INVALID.

You MUST return one of these formats.


TOOL:

{
  "action": "tool",
  "tool": "file",
  "toolAction": "readFile",
  "parameters": {
    "path": "S:\\\\example.txt"
  }
}


OR:


{
  "action": "tool",
  "tool": "terminal",
  "toolAction": "run",
  "parameters": {
    "command": "npm run build",
    "cwd": "S:\\\\project"
  }
}


WHEN FINISHED:

{
  "action": "answer",
  "response": "Task completed successfully."
}


Do not use:

"status"
"message"
"details"
"output"

as top-level response formats.

Do not invent file paths.

Return ONLY valid JSON.
`;

        continue;
      }

      /*
      ========================================
      FINAL ANSWER
      ========================================
      */

      if (
        decision.action ===
        "answer"
      ) {
        return (
          decision.response
        );
      }

      /*
      ========================================
      TOOL ACTION
      ========================================
      */

      if (
        decision.action ===
        "tool"
      ) {
        console.log(
          `\n🔧 Using tool: ${decision.tool}.${decision.toolAction}`
        );

        /*
        ----------------------------------------
        EXECUTE TOOL
        ----------------------------------------
        */

        const result =
          await this.executor.execute({
            tool:
              decision.tool,

            action:
              decision.toolAction,

            parameters:
              decision.parameters,
          });

        console.log(
          "\n🔧 Tool result:"
        );

        console.log(
          result
        );

        /*
        ----------------------------------------
        SEND RESULT BACK TO AI
        ----------------------------------------
        */

        conversationHistory += `


==================================================
PREVIOUS MODEL DECISION
==================================================

${rawResponse}


==================================================
TOOL RESULT
==================================================

${JSON.stringify(
  result,
  null,
  2
)}


==================================================
ORIGINAL USER REQUEST
==================================================

${userInput}


==================================================
NEXT ACTION
==================================================

Look at the tool result.

Determine whether the original user request
has been completely finished.

If more work is required,
use the next appropriate tool.

If the tool failed,
inspect the error and try to fix it safely.

If everything succeeded,
return:

{
  "action": "answer",
  "response": "Task completed successfully."
}

Do not repeat an action that already succeeded.

Do not claim success when:

"success": false

Return ONLY valid JSON.
`;

        continue;
      }
    }

    /*
    ========================================
    MAX STEPS
    ========================================
    */

    return (
      "The agent stopped because " +
      "the maximum number of steps was reached."
    );
  }
}