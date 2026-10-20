import { validatePlan, } from "./PlanValidator.js";
const READ_ONLY = new Set([
    "file_read_file",
    "file_list_files",
    "file_exists",
    "file_search",
]);
const SOURCE_DESTINATION = new Set([
    "file_rename",
    "file_move",
    "file_copy_file",
    "file_copy_folder",
]);
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function argument(step, key) {
    const value = step.arguments[key];
    return typeof value === "string" ? value : "";
}
export class TaskRunner {
    executor;
    context;
    availableTools;
    constructor(executor, context, availableTools) {
        this.executor = executor;
        this.context = context;
        this.availableTools = availableTools;
    }
    /** Read-only, permission-checked existence query via the registered FileTool. */
    async checkExists(path) {
        if (!path)
            return { ok: false, reason: "Missing path for existence check." };
        try {
            const result = await this.executor.execute({
                tool: "file",
                action: "fileExists",
                parameters: { path },
            });
            if (!result.success) {
                return {
                    ok: false,
                    reason: `Unable to check ${path}: ${String(result.message ?? "unknown error")}`,
                };
            }
            const data = record(result.data);
            if (typeof data?.exists !== "boolean") {
                return { ok: false, reason: `Unexpected existence-check response for ${path}.` };
            }
            return { ok: true, exists: data.exists };
        }
        catch (error) {
            return {
                ok: false,
                reason: `Existence check failed for ${path}: ${String(error)}`,
            };
        }
    }
    /** Do not persist or log returned file content. */
    async readText(path) {
        try {
            const result = await this.executor.execute({
                tool: "file",
                action: "readFile",
                parameters: { path },
            });
            if (!result.success) {
                return { ok: false, reason: String(result.message ?? "Read failed.") };
            }
            const data = record(result.data);
            if (typeof data?.content !== "string") {
                return { ok: false, reason: "Unexpected file content response." };
            }
            return { ok: true, content: data.content };
        }
        catch (error) {
            return { ok: false, reason: String(error) };
        }
    }
    async mustExist(path, expectation) {
        const check = await this.checkExists(path);
        if (!check.ok)
            return check.reason;
        if (check.exists !== expectation) {
            return expectation
                ? `Source does not exist: ${path}`
                : `Destination already exists: ${path}. Nothing was overwritten.`;
        }
        return null;
    }
    /**
     * Conservative checks before requesting modification approval.
     * FileTool repeats critical checks during execution to guard against races.
     */
    async preflight(step) {
        const tool = step.toolName;
        if (!tool.startsWith("file_") || tool === "file_restore") {
            return { ok: true };
        }
        const path = argument(step, "path");
        if (tool === "file_create_file" || tool === "file_create_folder") {
            const error = await this.mustExist(path, false);
            return error ? { ok: false, reason: error } : { ok: true };
        }
        if (SOURCE_DESTINATION.has(tool)) {
            const oldPath = argument(step, "oldPath");
            const newPath = argument(step, "newPath");
            const sourceError = await this.mustExist(oldPath, true);
            if (sourceError)
                return { ok: false, reason: sourceError };
            const destinationError = await this.mustExist(newPath, false);
            return destinationError
                ? { ok: false, reason: destinationError }
                : { ok: true };
        }
        if (["file_write_file", "file_edit_file", "file_delete_file", "file_delete_folder"].includes(tool)) {
            const error = await this.mustExist(path, true);
            if (error)
                return { ok: false, reason: error };
        }
        if (tool === "file_edit_file") {
            const read = await this.readText(path);
            if (!read.ok)
                return { ok: false, reason: `Could not inspect file before editing: ${read.reason}` };
            const search = argument(step, "search");
            const replacement = argument(step, "replacement");
            if (!search)
                return { ok: false, reason: "Edit search text cannot be empty." };
            const occurrences = read.content.split(search).length - 1;
            if (occurrences === 0) {
                return { ok: false, reason: "Text to edit was not found. No change made." };
            }
            if (occurrences > 1 && step.arguments.replaceAll !== true) {
                return {
                    ok: false,
                    reason: `${occurrences} matches found. Choose replaceAll to edit every match.`,
                };
            }
            return {
                ok: true,
                expectedContent: step.arguments.replaceAll === true
                    ? read.content.split(search).join(replacement)
                    : read.content.replace(search, replacement),
            };
        }
        return { ok: true };
    }
    /**
     * Independently check observable results using read-only FileTool calls.
     * A failure here means the action MAY have happened but could not be verified.
     * Never retry a mutation automatically.
     */
    async verifyStep(step, data, preflight) {
        const tool = step.toolName;
        if (!tool.startsWith("file_") || READ_ONLY.has(tool))
            return null;
        const path = argument(step, "path");
        const oldPath = argument(step, "oldPath");
        const newPath = argument(step, "newPath");
        if (tool === "file_delete_file" || tool === "file_delete_folder") {
            return this.mustExist(path, false);
        }
        if (SOURCE_DESTINATION.has(tool)) {
            const destError = await this.mustExist(newPath, true);
            if (destError)
                return destError;
            return this.mustExist(oldPath, tool === "file_copy_file" || tool === "file_copy_folder");
        }
        if (tool === "file_restore") {
            const details = record(data);
            if (typeof details?.path === "string") {
                return this.mustExist(details.path, true);
            }
            if (typeof details?.newPath === "string" && typeof details.oldPath === "string") {
                const restored = await this.mustExist(details.newPath, true);
                return restored ?? this.mustExist(details.oldPath, false);
            }
            return "Restore returned no verifiable destination path.";
        }
        if (["file_create_file", "file_create_folder", "file_write_file", "file_edit_file"].includes(tool)) {
            const exists = await this.mustExist(path, true);
            if (exists)
                return exists;
        }
        const expectedContent = tool === "file_edit_file"
            ? preflight.expectedContent
            : tool === "file_create_file" || tool === "file_write_file"
                ? argument(step, "content")
                : undefined;
        if (expectedContent !== undefined) {
            const read = await this.readText(path);
            if (!read.ok)
                return `Could not verify file contents: ${read.reason}`;
            if (read.content !== expectedContent)
                return `File contents differ from the planned result: ${path}`;
        }
        return null;
    }
    failure(goal, totalSteps, results, message) {
        this.context.failTask();
        return {
            success: false,
            goal,
            completedSteps: results.filter((item) => item.success).length,
            totalSteps,
            results,
            message,
        };
    }
    /** No direct filesystem calls; no model calls; no natural-language parsing. */
    async run(decision, options = {}) {
        if (decision.kind !== "plan") {
            return {
                success: false,
                goal: "",
                completedSteps: 0,
                totalSteps: 0,
                results: [],
                message: "There is no executable task plan.",
            };
        }
        const validation = validatePlan(decision, this.availableTools);
        if (!validation.valid) {
            return {
                success: false,
                goal: decision.goal,
                completedSteps: 0,
                totalSteps: decision.steps.length,
                results: [],
                message: `Plan rejected: ${validation.message}`,
            };
        }
        const plan = validation.plan;
        if (options.allowedToolNames) {
            const rejected = plan.steps.find((step) => !options.allowedToolNames?.has(step.toolName));
            if (rejected) {
                return {
                    success: false,
                    goal: plan.goal,
                    completedSteps: 0,
                    totalSteps: plan.steps.length,
                    results: [],
                    message: `Tool ${rejected.toolName} is not enabled for this task.`,
                };
            }
        }
        this.context.startTask(plan.goal);
        this.context.setExecuting();
        const started = performance.now();
        const results = [];
        const completed = new Set();
        console.log(`[TaskRunner] Starting: ${plan.goal}`);
        for (const step of plan.steps) {
            if (!step.dependsOn.every((id) => completed.has(id))) {
                return this.failure(plan.goal, plan.steps.length, results, `Dependencies for ${step.id} were not completed.`);
            }
            console.log(`[TaskRunner] Executing ${step.id}: ${step.toolName}`);
            let result;
            try {
                const checked = await this.preflight(step);
                if (!checked.ok) {
                    result = {
                        stepId: step.id,
                        toolName: step.toolName,
                        success: false,
                        message: `Preflight rejected: ${checked.reason}`,
                    };
                }
                else {
                    // Actual authorization takes place inside Executor, immediately
                    // before execution. Do not call FileTool directly here.
                    const outcome = await this.executor.execute(step.request);
                    const reported = String(outcome.message ?? (outcome.success ? "Action completed." : "Action failed."));
                    if (!outcome.success) {
                        result = {
                            stepId: step.id,
                            toolName: step.toolName,
                            success: false,
                            message: reported,
                            data: outcome.data,
                        };
                    }
                    else {
                        const verificationError = await this.verifyStep(step, outcome.data, checked);
                        result = verificationError
                            ? {
                                stepId: step.id,
                                toolName: step.toolName,
                                success: false,
                                message: `Tool reported success, but verification failed: ${verificationError}. ` +
                                    "The filesystem may already have changed. Do not retry automatically.",
                                data: outcome.data,
                            }
                            : {
                                stepId: step.id,
                                toolName: step.toolName,
                                success: true,
                                message: reported,
                                data: outcome.data,
                            };
                    }
                }
            }
            catch (error) {
                result = {
                    stepId: step.id,
                    toolName: step.toolName,
                    success: false,
                    message: `Execution/verification error: ${error instanceof Error ? error.message : String(error)}. ` +
                        "Review the filesystem before retrying.",
                };
            }
            results.push(result);
            // Persist only generic metadata, never arbitrary file contents.
            this.context.recordStep(result.stepId, result.toolName, result.success, result.success ? "Tool succeeded and verification passed." : "Tool or verification failed.");
            if (!result.success) {
                console.warn(`[TaskRunner] Failed: ${step.id}`, result.message);
                return this.failure(plan.goal, plan.steps.length, results, `Step ${step.id} failed: ${result.message}. ` +
                    (completed.size > 0 ? "Earlier completed actions were not rolled back." : ""));
            }
            completed.add(step.id);
        }
        this.context.completeTask();
        console.log(`[TaskRunner] Finished in ${((performance.now() - started) / 1000).toFixed(2)}s`);
        return {
            success: true,
            goal: plan.goal,
            completedSteps: results.length,
            totalSteps: plan.steps.length,
            results,
            message: `Completed and verified ${results.length} of ${plan.steps.length} steps.`,
        };
    }
}
