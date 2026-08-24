import { askOllama } from "../ollama/OllamaClient.js";
import { FileTool } from "../tools/FileTool.js";
import type { Tool } from "../tools/Tool.js";

type AgentDecision =
  | {
      action: "answer";
      response: string;
    }
  | {
      action: "tool";
      tool: string;
      input: {
        action: string;
        path: string;
        content?: string;
      };
    };

export class Agent {
  private tools: Tool[];

  constructor() {
    this.tools = [
      new FileTool(),
    ];
  }

  async run(userInput: string): Promise<string> {
    const prompt = `
You are an AI agent that controls computer tools.

User request:
"${userInput}"

Available tool:

file
- Create or write a file:
  {"action":"write","path":"filename.txt","content":"text"}
- Read a file:
  {"action":"read","path":"filename.txt"}
- List files:
  {"action":"list","path":"."}

IMPORTANT:
If the user asks you to create or write a file, you MUST use the file tool.

Return ONLY valid JSON.

For a tool:
{
  "action": "tool",
  "tool": "file",
  "input": {
    "action": "write",
    "path": "hello.txt",
    "content": "Hello World"
  }
}

For a normal answer:
{
  "action": "answer",
  "response": "your answer"
}

Do not use markdown.
Do not explain anything outside the JSON.
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

      return await tool.execute(toolInput);
    }

    return "Unknown agent action.";
  }
}