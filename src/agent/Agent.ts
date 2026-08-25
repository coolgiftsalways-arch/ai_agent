import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import { TerminalTool } from "../tools/TerminalTool.js";
import type { Tool } from "../tools/Tool.js";

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

  constructor() {
    this.tools = [
      new FileTool(),
      new TerminalTool(),
    ];
  }

  async run(userInput: string): Promise<string> {
    const toolDescriptions = this.tools
      .map(
        (tool) =>
          `Tool: ${tool.name}\nDescription: ${tool.description}`
      )
      .join("\n\n");

    const prompt = `
You are a local AI coding agent.

You receive a user's request and decide whether to answer directly
or use one of your available tools.

Available tools:

${toolDescriptions}

FILE TOOL:

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

TERMINAL TOOL:

Run a command:
{
  "command": "npm run build"
}

USER REQUEST:

${userInput}

RULES:

1. If the user asks you to create, write, read, or list files, use the file tool.

2. If the user asks you to run a command, use the terminal tool.

3. If the request can be answered without a tool, answer directly.

4. Return ONLY valid JSON.

5. Do not use markdown.

6. Do not explain your decision outside the JSON.

For a file operation:

{
  "action": "tool",
  "tool": "file",
  "input": {
    "action": "write",
    "path": "hello.txt",
    "content": "Hello World"
  }
}

For a terminal operation:

{
  "action": "tool",
  "tool": "terminal",
  "input": {
    "command": "npm run build"
  }
}

For a normal answer:

{
  "action": "answer",
  "response": "your answer"
}
`;

    const rawResponse = await askOllama(prompt);

    console.log("\nModel decision:");
    console.log(rawResponse);

    let decision: AgentDecision;

    try {
      decision = JSON.parse(rawResponse);
    } catch {
      return `I couldn't understand the model's decision:\n${rawResponse}`;
    }

    if (decision.action === "answer") {
      return decision.response;
    }

    if (decision.action === "tool") {
      const tool = this.tools.find(
        (availableTool) => availableTool.name === decision.tool
      );

      if (!tool) {
        return `Tool not found: ${decision.tool}`;
      }

      const result = await tool.execute(
        JSON.stringify(decision.input)
      );

      return result;
    }

    return "Unknown agent action.";
  }
}