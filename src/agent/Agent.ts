import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import type { Tool } from "../tools/Tool.js";
import { TerminalTool } from "../tools/TerminalTool.js";

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
    const prompt = `
You are an AI agent that can perform actions inside a computer project.

User request:
"${userInput}"

Available tools:

1. file

Purpose:
Create, read, write, and list files.

Create/write:
{
  "action": "write",
  "path": "filename.txt",
  "content": "text"
}

Read:
{
  "action": "read",
  "path": "filename.txt"
}

List:
{
  "action": "list",
  "path": "."
}


2. terminal

Purpose:
Run commands inside the current project workspace.

Example:
{
  "command": "npm run build"
}

IMPORTANT RULES:

1. If the user asks you to CREATE, WRITE, READ, LIST, RUN, CHECK, TEST, BUILD, INSTALL, or EXECUTE something that requires interacting with the project, YOU MUST USE A TOOL.

2. If the user asks you to check whether the TypeScript project builds successfully, use:

{
  "action": "tool",
  "tool": "terminal",
  "input": {
    "command": "npm run build"
  }
}

3. If the user asks you to create or write a file, use the file tool.

4. If the user asks you to run a command, use the terminal tool.

5. Do not claim that you performed an action unless you actually use the appropriate tool.

6. Do not say that you need additional information when an available tool can perform the requested operation.

7. Do not answer from assumptions when a tool can provide the real result.

8. Return ONLY valid JSON.

For a terminal tool call:

{
  "action": "tool",
  "tool": "terminal",
  "input": {
    "command": "npm run build"
  }
}

For a file tool call:

{
  "action": "tool",
  "tool": "file",
  "input": {
    "action": "write",
    "path": "hello.txt",
    "content": "Hello World"
  }
}

For a normal question that does not require a tool:

{
  "action": "answer",
  "response": "your answer"
}

Do not use markdown.
Do not explain your decision.
Do not put text outside the JSON.
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

      const toolInput = JSON.stringify(decision.input);

      const result = await tool.execute(toolInput);

      return result;
    }

    return "Unknown agent action.";
  }
}