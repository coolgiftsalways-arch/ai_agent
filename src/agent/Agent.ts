import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import { TerminalTool } from "../tools/TerminalTool.js";
import type { Tool } from "../tools/Tool.js";
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
    // Remove markdown code fences if the model adds them.
    const cleaned = rawResponse
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // Find the first JSON object.
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

    let conversation = `
You are a local AI coding agent.

User request:
${userInput}

Available tools:

${toolDescriptions}

FILE TOOL:

Write:
{
  "action": "write",
  "path": "file.txt",
  "content": "content"
}

Read:
{
  "action": "read",
  "path": "file.txt"
}

List:
{
  "action": "list",
  "path": "."
}

TERMINAL TOOL:

Run:
{
  "command": "npm run build"
}

IMPORTANT RULES:

1. Perform ONLY ONE action at a time.
2. Return ONLY ONE JSON object.
3. NEVER return multiple JSON objects.
4. After a tool result is provided, decide what to do next.
5. If the task is complete, return an answer.
6. Do not use markdown.

Tool format:

{
  "action": "tool",
  "tool": "file",
  "input": {}
}

OR:

{
  "action": "tool",
  "tool": "terminal",
  "input": {}
}

Final answer format:

{
  "action": "answer",
  "response": "Task completed."
}
`;

    const MAX_STEPS = 5;

    for (let step = 1; step <= MAX_STEPS; step++) {
      console.log(`\n🧠 Agent step ${step}/${MAX_STEPS}`);

      const rawResponse = await askOllama(conversation);

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
        console.log(`\n🔧 Executing tool: ${decision.tool}`);

        const result = await this.executor.execute(
          decision.tool,
          decision.input
        );

        console.log("\n📋 Tool result:");
        console.log(result);

        conversation += `

IMPORTANT:
You already completed the previous action.

Previous tool:
${decision.tool}

Previous tool input:
${JSON.stringify(decision.input)}

Previous tool result:
${result}

Now perform ONLY ONE next action.

If another tool is required, return ONE JSON object:

{
  "action": "tool",
  "tool": "tool_name",
  "input": {}
}

If the task is complete, return ONE JSON object:

{
  "action": "answer",
  "response": "Task completed."
}
`;

        continue;
      }

      return "Unknown agent action.";
    }

    return "The agent stopped because the maximum number of steps was reached.";
  }
}