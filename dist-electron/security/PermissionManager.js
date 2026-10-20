/**
 * NEXA — permission gate for executable tools.
 *
 * Authorization happens inside Executor, after the tool request has been
 * validated and mapped. This module does not interpret natural language.
 */
/**
 * These operations must not silently become "safe" through a settings
 * mistake. Explicit blocking is still supported.
 */
const REQUIRE_CONFIRM = new Set([
    "file.writeFile",
    "file.editFile",
    "file.renameFile",
    "file.moveFile",
    "file.copyFile",
    "file.copyFolder",
    "file.deleteFile",
    "file.deleteFolder",
    "file.restoreFile",
    "terminal.run",
    "memory.forget",
    "memory.clearAll",
    "gmail.send",
    "whatsapp.send",
]);
function printable(value) {
    return typeof value === "string" ? value : String(value ?? "");
}
function excerpt(value, limit = 240) {
    const result = printable(value);
    return result.length <= limit
        ? result
        : `${result.slice(0, limit)}… (${result.length} characters total)`;
}
export class PermissionManager {
    approvalFunction;
    permissions = {
        // File: non-destructive reads and creations.
        "file.readFile": "safe",
        "file.listFiles": "safe",
        "file.fileExists": "safe",
        "file.searchFiles": "safe",
        "file.createFile": "safe",
        "file.createFolder": "safe",
        // File: mutation, copy, and recovery actions.
        "file.writeFile": "confirm",
        "file.editFile": "confirm",
        "file.renameFile": "confirm",
        "file.moveFile": "confirm",
        "file.copyFile": "confirm",
        "file.copyFolder": "confirm",
        "file.deleteFile": "confirm",
        "file.deleteFolder": "confirm",
        "file.restoreFile": "confirm",
        // Existing tools: preserved.
        "terminal.run": "confirm",
        "memory.remember": "safe",
        "memory.search": "safe",
        "memory.recent": "safe",
        "memory.forget": "confirm",
        "memory.clearAll": "confirm",
        "gmail.recent": "safe",
        "gmail.search": "safe",
        "gmail.read": "safe",
        "gmail.send": "confirm",
        "whatsapp.read": "safe",
        "whatsapp.send": "confirm",
    };
    constructor(approvalFunction) {
        this.approvalFunction = approvalFunction;
    }
    buildApprovalMessage(permissionKey, parameters) {
        const args = parameters ?? {};
        if (permissionKey === "gmail.send") {
            // Preserve complete Gmail preview so the user can inspect the message.
            return [
                "Gmail send approval required",
                `To: ${printable(args.to)}`,
                `Subject: ${printable(args.subject)}`,
                "",
                "Message:",
                printable(args.body),
                "",
                "Send this email?",
            ].join("\n");
        }
        if (permissionKey.startsWith("file.")) {
            const parts = [
                "NEXA FILE ACTION — approval required",
                `Action: ${permissionKey}`,
            ];
            if (typeof args.path === "string") {
                parts.push(`Path: ${args.path}`);
            }
            if (typeof args.oldPath === "string") {
                parts.push(`Source: ${args.oldPath}`);
            }
            if (typeof args.newPath === "string") {
                parts.push(`Destination: ${args.newPath}`);
            }
            if (typeof args.recoveryId === "string") {
                parts.push(`Recovery ID: ${args.recoveryId}`);
            }
            if (permissionKey === "file.writeFile") {
                parts.push("WARNING: Replaces the file's entire contents.", `New content: ${excerpt(args.content)}`);
            }
            if (permissionKey === "file.editFile") {
                parts.push(`Find exact text: ${excerpt(args.search)}`, `Replace with: ${excerpt(args.replacement)}`, `Replace every occurrence: ${args.replaceAll === true ? "Yes" : "No"}`);
            }
            if (permissionKey === "file.deleteFile" ||
                permissionKey === "file.deleteFolder") {
                parts.push("WARNING: This removes the item from its current location.");
                if (permissionKey === "file.deleteFolder") {
                    parts.push("The folder and its contents may be affected.");
                }
            }
            if (permissionKey === "file.restoreFile") {
                parts.push("WARNING: Restoring may change the current filesystem state.");
            }
            parts.push("", "Approve this specific file action?");
            return parts.join("\n");
        }
        // For terminal and other actions, show the complete request for review.
        const details = parameters ? JSON.stringify(parameters, null, 2) : "";
        return [
            "Allow action?",
            permissionKey,
            details,
        ].filter(Boolean).join("\n\n");
    }
    async authorize(tool, action, parameters) {
        const permissionKey = `${tool}.${action}`;
        const configuredLevel = this.permissions[permissionKey] ?? "confirm";
        const level = configuredLevel === "safe" && REQUIRE_CONFIRM.has(permissionKey)
            ? "confirm"
            : configuredLevel;
        if (level === "safe")
            return true;
        if (level === "blocked") {
            console.log(`Blocked: ${permissionKey}`);
            return false;
        }
        if (!this.approvalFunction) {
            console.log(`Approval required: ${permissionKey}`);
            return false;
        }
        const message = this.buildApprovalMessage(permissionKey, parameters);
        try {
            return (await this.approvalFunction(message)) === true;
        }
        catch (error) {
            console.error(`Approval failed for ${permissionKey}:`, error);
            return false;
        }
    }
    /** Existing settings API; critical actions always require confirmation. */
    setPermission(tool, action, level) {
        this.permissions[`${tool}.${action}`] = level;
    }
}
