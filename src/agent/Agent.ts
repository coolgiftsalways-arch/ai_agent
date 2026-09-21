import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import type { Tool } from "../tools/Tool.js";
import { TerminalTool } from "../tools/TerminalTool.js";
import { Executor } from "./Executor.js";

type AgentDecision =
  | {
      action: "answer";
      response: string;
    }
  | {
      action: "tool";
      tool: string;
      input: Record<string, unknown>;
    };

export class Agent {
  private tools: Tool[];
  private executor: Executor;

  constructor() {
    this.tools = [
      new FileTool(),
      new TerminalTool(),
    ];

    this.executor = new Executor(this.tools);
  }

  private parseDecision(rawResponse: string): AgentDecision | null {
    const cleaned = rawResponse
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const start = cleaned.indexOf("{");

    if (start === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
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
          const jsonText = cleaned.slice(start, i + 1);

          try {
            return JSON.parse(jsonText) as AgentDecision;
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  async run(userInput: string): Promise<string> {
    const toolDescriptions = this.tools
      .map(
        (tool) =>
          `Tool: ${tool.name}\nDescription: ${tool.description}`
      )
      .join("\n\n");

    const conversation = `
You are a local AI coding agent.

Your job is to understand the user's request and either:
1. Answer directly, or
2. Use one of your available tools.

AVAILABLE TOOLS:

${toolDescriptions}

FILE TOOL EXAMPLES:

Write a file:
{
  "action": "write",
  "path": "hello.txt",
  "content": "Hello World"
}

Read a file:
{
  "action": "read",
  "path": "hello.txt"
}

List files:
{
  "action": "list",
  "path": "."
}

TERMINAL TOOL EXAMPLE:

{
  "command": "npm run build"
}

USER REQUEST:

${userInput}

RULES:

1. If the user asks you to create, write, read, or list files, use the file tool.

2. If the user asks you to run, execute, check, test, build, or install something, use the terminal tool.

3. If the task requires multiple actions, perform the actions one at a time.

4. After a tool returns a result, decide what to do next.

5. Do not claim that an action was completed unless the tool actually completed it.

6. Return ONLY valid JSON.

7. Do not use markdown.

8. Do not explain your decision outside the JSON.

TOOL FORMAT:

{
  "action": "tool",
  "tool": "file",
  "input": {
    "action": "write",
    "path": "hello.txt",
    "content": "Hello World"
  }
}

OR:

{
  "action": "tool",
  "tool": "terminal",
  "input": {
    "command": "npm run build"
  }
}

ANSWER FORMAT:

{
  "action": "answer",
  "response": "your final answer"
}
`;

    let conversationHistory = conversation;

    const MAX_STEPS = 5;

    for (let step = 1; step <= MAX_STEPS; step++) {
      console.log(`\n🧠 Agent step ${step}/${MAX_STEPS}`);

      const rawResponse = await askOllama(conversationHistory);

      console.log("\nModel decision:");
      console.log(rawResponse);

      const decision = this.parseDecision(rawResponse);

      if (!decision) {
        return `I couldn't understand the model response:\n${rawResponse}`;
      }

      if (decision.action === "answer") {
        return decision.response;
      }

      if (decision.action === "tool") {
        const result = await this.executor.execute(
          decision.tool,
          decision.input
        );

        console.log("\n🔧 Tool result:");
        console.log(result);

        conversationHistory += `

MODEL DECISION:
${rawResponse}

TOOL RESULT:
${result}

Based on the tool result, decide what to do next.

Return ONLY valid JSON.
`;

        continue;
      }

      return "Unknown agent action.";
    }

    return "The agent stopped because the maximum number of steps was reached.";
  }
}