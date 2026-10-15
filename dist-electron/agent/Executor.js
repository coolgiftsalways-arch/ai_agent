export class Executor {
    permissionManager;
    tools = new Map();
    constructor(permissionManager) {
        this.permissionManager = permissionManager;
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
        console.log(`🔧 Tool registered: ${tool.name}`);
    }
    async execute(request) {
        const tool = this.tools.get(request.tool);
        if (!tool) {
            return {
                success: false,
                message: `Tool not found: ${request.tool}`,
            };
        }
        const allowed = await this.permissionManager.authorize(request.tool, request.action, request.parameters);
        if (!allowed) {
            return {
                success: false,
                message: `Permission denied: ${request.tool}.${request.action}`,
            };
        }
        try {
            const result = await tool.execute(request.action, request.parameters);
            return result;
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error
                    ? error.message
                    : String(error),
            };
        }
    }
}
