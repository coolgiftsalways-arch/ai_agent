import nodePath from "node:path";
import { validateAgentToolCall, mapAgentToolCall, } from "../tools/AgentToolRouter.js";
const MAX_PLAN_STEPS = 12;
/**
 * Structural tool policy — not a list of natural-language phrases.
 * A restore uses a recovery ID, not a filesystem path.
 */
const FILE_PATH_FIELDS = {
    file_create_folder: ["path"],
    file_create_file: ["path"],
    file_read_file: ["path"],
    file_write_file: ["path"],
    file_edit_file: ["path"],
    file_list_files: ["path"],
    file_exists: ["path"],
    file_search: ["path"],
    file_rename: ["oldPath", "newPath"],
    file_move: ["oldPath", "newPath"],
    file_copy_file: ["oldPath", "newPath"],
    file_copy_folder: ["oldPath", "newPath"],
    file_delete_file: ["path"],
    file_delete_folder: ["path"],
    file_restore: [],
};
const READ_ONLY_FILE_TOOLS = new Set([
    "file_read_file",
    "file_list_files",
    "file_exists",
    "file_search",
]);
const TWO_PATH_TOOLS = new Set([
    "file_rename",
    "file_move",
    "file_copy_file",
    "file_copy_folder",
]);
function reject(message) {
    return { valid: false, message };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toolNames(tools) {
    return new Set(tools
        .map((tool) => tool.function?.name)
        .filter((name) => typeof name === "string" && name.trim().length > 0));
}
function validateDependencies(steps) {
    const seen = new Set();
    for (const step of steps) {
        if (!step || typeof step !== "object") {
            return "A task step is not a valid object.";
        }
        if (typeof step.id !== "string" || !step.id.trim()) {
            return "A task step must have a non-empty ID.";
        }
        if (seen.has(step.id)) {
            return `Duplicate step ID: ${step.id}`;
        }
        if (!Array.isArray(step.dependsOn)) {
            return `Step ${step.id} has invalid dependencies.`;
        }
        const dependencies = new Set();
        for (const dependency of step.dependsOn) {
            if (typeof dependency !== "string" || !dependency.trim()) {
                return `Step ${step.id} contains an invalid dependency.`;
            }
            if (dependencies.has(dependency)) {
                return `Step ${step.id} repeats dependency ${dependency}.`;
            }
            if (!seen.has(dependency)) {
                return `Step ${step.id} depends on ${dependency}, which is not an earlier step.`;
            }
            dependencies.add(dependency);
        }
        seen.add(step.id);
    }
    return null;
}
/**
 * Accept ordinary absolute, drive-qualified Windows paths (e.g. S:\\MyApp).
 * Reject traversal, UNC/device paths, control characters, and malformed names.
 * This is lexical screening, NOT allowed-root or realpath authorization.
 */
function normalizeWindowsPath(value) {
    if (typeof value !== "string")
        return null;
    const raw = value.trim();
    if (!/^[a-zA-Z]:[\\/]/.test(raw) || !nodePath.win32.isAbsolute(raw)) {
        return null;
    }
    if (/[\x00-\x1f<>"|?*]/.test(raw) || raw.slice(2).includes(":")) {
        return null;
    }
    const parts = raw.slice(3).split(/[\\/]/);
    if (parts.some((part) => part === ".."))
        return null;
    if (parts.some((part) => /[. ]$/.test(part) && part !== "" && part !== ".")) {
        return null;
    }
    // Windows device names remain special even with an extension.
    if (parts.some((part) => /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))) {
        return null;
    }
    return nodePath.win32.normalize(raw);
}
function isDriveRoot(value) {
    return value.toLowerCase() === nodePath.win32.parse(value).root.toLowerCase();
}
function isWithin(candidate, base) {
    const relative = nodePath.win32.relative(base, candidate);
    return (relative === "" ||
        (relative !== ".." &&
            !relative.startsWith(`..${nodePath.win32.sep}`) &&
            !nodePath.win32.isAbsolute(relative)));
}
/**
 * Enforce the path shape of every registered native file tool.
 * Zod validates each tool's non-path arguments, including recoveryId.
 * Source/destination existence and collisions are checked by FileTool.
 */
function validateFileArguments(toolName, args) {
    if (!toolName.startsWith("file_"))
        return null;
    const fields = FILE_PATH_FIELDS[toolName];
    if (!fields) {
        return `Missing file-path policy for ${toolName}.`;
    }
    for (const field of fields) {
        const normalized = normalizeWindowsPath(args[field]);
        if (!normalized) {
            return `Invalid absolute Windows ${field} for ${toolName}.`;
        }
        if (!READ_ONLY_FILE_TOOLS.has(toolName) && isDriveRoot(normalized)) {
            return `Refusing ${toolName} on a drive root.`;
        }
        args[field] = normalized;
    }
    if (TWO_PATH_TOOLS.has(toolName)) {
        const source = args.oldPath;
        const destination = args.newPath;
        if (source.toLowerCase() === destination.toLowerCase()) {
            return `Source and destination are identical for ${toolName}.`;
        }
        if (toolName !== "file_copy_file" && isWithin(destination, source)) {
            return `Destination cannot be inside its source for ${toolName}.`;
        }
    }
    return null;
}
/**
 * Validate every step before TaskRunner executes anything.
 * Executor / PermissionManager still authorize each individual operation.
 */
export function validatePlan(decision, availableTools) {
    if (decision.kind !== "plan") {
        return reject("The AI decision does not contain an executable plan.");
    }
    if (typeof decision.goal !== "string" || !decision.goal.trim()) {
        return reject("The task goal is missing.");
    }
    if (!Array.isArray(decision.steps) ||
        decision.steps.length === 0 ||
        decision.steps.length > MAX_PLAN_STEPS) {
        return reject(`A plan must contain between 1 and ${MAX_PLAN_STEPS} steps.`);
    }
    const dependencyError = validateDependencies(decision.steps);
    if (dependencyError)
        return reject(dependencyError);
    const permittedToolNames = toolNames(availableTools);
    const validatedSteps = [];
    for (const step of decision.steps) {
        if (typeof step.toolName !== "string" ||
            !permittedToolNames.has(step.toolName)) {
            return reject(`Unknown or unavailable tool: ${String(step.toolName)}`);
        }
        if (!isRecord(step.arguments)) {
            return reject(`Invalid arguments for ${step.toolName}.`);
        }
        const validation = validateAgentToolCall(step.toolName, step.arguments);
        if (!validation.success) {
            return reject(`Step ${step.id} rejected: ${validation.message}`);
        }
        // Work on validated arguments only; never mutate the planner's source plan.
        const args = { ...validation.args };
        const fileError = validateFileArguments(step.toolName, args);
        if (fileError)
            return reject(`Step ${step.id} rejected: ${fileError}`);
        const request = mapAgentToolCall(step.toolName, args);
        if (!request ||
            typeof request.tool !== "string" ||
            typeof request.action !== "string" ||
            !isRecord(request.parameters)) {
            return reject(`No valid executable mapping for ${step.toolName}.`);
        }
        if (step.toolName.startsWith("file_") && request.tool !== "file") {
            return reject(`Invalid file-tool mapping for ${step.toolName}.`);
        }
        validatedSteps.push({
            id: step.id,
            toolName: step.toolName,
            arguments: args,
            dependsOn: [...step.dependsOn],
            request,
        });
    }
    return {
        valid: true,
        plan: {
            goal: decision.goal.trim(),
            steps: validatedSteps,
        },
    };
}
