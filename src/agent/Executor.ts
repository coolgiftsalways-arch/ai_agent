import type { Tool } from "../tools/Tool.js";

export class Executor {
  private tools: Tool[];

  constructor(tools: Tool[]) {
    this.tools = tools;
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    const tool = this.tools.find((item) => item.name === toolName);

    if (!tool) {
      return `Tool not found: ${toolName}`;
    }

    try {
      return await tool.execute(JSON.stringify(input));
    } catch (error) {
      return `Tool execution error: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}