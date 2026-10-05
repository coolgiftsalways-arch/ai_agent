import { Tool, ToolResult } from "../tools/Tool.js";
import { PermissionManager } from "../security/PermissionManager.js";

export interface AgentToolRequest {
  tool: string;
  action: string;
  parameters: Record<string, unknown>;
}

export class Executor {
  private tools = new Map<string, Tool>();

  constructor(
    private permissionManager: PermissionManager
  ) {}

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);

    console.log(
      `🔧 Tool registered: ${tool.name}`
    );
  }

  async execute(
    request: AgentToolRequest
  ): Promise<ToolResult> {
    const tool = this.tools.get(
      request.tool
    );

    if (!tool) {
      return {
        success: false,
        message: `Tool not found: ${request.tool}`,
      };
    }

    const allowed =
      await this.permissionManager.authorize(
        request.tool,
        request.action,
        request.parameters
      );

    if (!allowed) {
      return {
        success: false,
        message: `Permission denied: ${request.tool}.${request.action}`,
      };
    }

    try {
      const result =
        await tool.execute(
          request.action,
          request.parameters
        );

      return result;
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}