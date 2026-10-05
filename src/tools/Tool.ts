export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface Tool {
  name: string;
  

  execute(
    action: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult>;
}