import { planFileRequest } from "./Planner.js";
import { validateAgentToolCall, mapAgentToolCall, } from "../tools/AgentToolRouter.js";
import { formatFileResult, } from "./FileResultFormatter.js";
/**
 * Connects AI planning to the existing FileTool.
 *
 * Does not bypass:
 * - tool validation
 * - Executor
 * - PermissionManager
 * - FileTool path security
 *
 * Only read-only file actions are supported in V1.
 */
export async function runAIFilePlanner(userInput, executor) {
    const input = userInput.trim();
    // Coarse domain routing only.
    // Natural-language understanding happens in AI.
    const filesystemContext = /\b(files?|folders?|directories|directory|projects?|paths?)\b/i.test(input) ||
        /[A-Za-z]:[\\/]/.test(input);
    if (!filesystemContext) {
        return null;
    }
    // Keep existing Gmail and browser routing separate.
    if (/\b(email|emails|gmail|inbox|website|webpage|browser)\b/i.test(input)) {
        return null;
    }
    // Only read-only operations in this release.
    if (/\b(create|make|write|edit|update|modify|delete|remove|rename|move|copy|overwrite|send|install|execute|run|upload|download)\b/i.test(input)) {
        return null;
    }
    const plan = await planFileRequest(input);
    if (plan.status === "unsupported") {
        return null;
    }
    if (plan.status === "clarify") {
        return plan.message;
    }
    const allowedTools = new Set([
        "file_list_files",
        "file_read_file",
        "file_exists",
    ]);
    if (!allowedTools.has(plan.toolName)) {
        return "The AI requested an unsupported file action.";
    }
    const validation = validateAgentToolCall(plan.toolName, plan.args);
    if (!validation.success) {
        return ("File request rejected: " +
            validation.message);
    }
    const request = mapAgentToolCall(plan.toolName, validation.args);
    if (!request ||
        request.tool !== "file" ||
        ![
            "listFiles",
            "readFile",
            "fileExists",
        ].includes(request.action)) {
        return "The requested file action is unavailable.";
    }
    const started = performance.now();
    // Existing Executor applies permissions
    // before calling the real FileTool.
    const result = await executor.execute(request);
    console.log(`[AIFilePlanner] Executed in ${((performance.now() - started) /
        1000).toFixed(2)}s`);
    if (!result.success) {
        return ("File request failed: " +
            String(result.message ?? "Unknown error"));
    }
    return formatFileResult(plan.toolName, result);
}
