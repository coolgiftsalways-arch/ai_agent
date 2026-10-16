import fs from "node:fs";
import path from "node:path";
const BLOCKED = /\b(delete|remove|erase|rename|move|copy|overwrite|modify|edit|send|upload|download|then|also|afterwards|recursive|recursively)\b/i;
const DRIVE_PATH = /^[a-z]:[\\/]/i;
const PROJECT_ALIAS = /^(?:(?:my|the|our)\s+)?(?:ai[\s_-]*agent[\s_-]*project|project(?:\s+folder)?|current\s+project)$/i;
function tidy(value) {
    let result = value.trim().replace(/^["']|["']$/g, "").trim();
    if (/[.!?]$/.test(result) && !/[\\/]$/.test(result))
        result = result.slice(0, -1).trim();
    return result;
}
function validPath(value) {
    if (!DRIVE_PATH.test(value) || /[\x00-\x1f"<>|?*]/.test(value) || value.slice(2).includes(":"))
        return null;
    const normalized = path.win32.normalize(value);
    if (normalized.split(/[\\/]/).some(part => part === ".."))
        return null;
    return normalized;
}
function projectPath() {
    const cwd = process.cwd();
    return validPath(cwd);
}
/**
 * Only search direct children of known safe roots, not the whole computer.
 * Read-only lookup. A matching folder must exist. Ambiguity returns a question.
 * Do not use loose aliases for writes.
 */
function resolveFolder(value, allowName) {
    const raw = tidy(value).replace(/^(?:of\s+|the\s+folder\s+|folder\s+|directory\s+)/i, "").trim();
    if (!raw)
        return null;
    if (PROJECT_ALIAS.test(raw)) {
        const p = projectPath();
        return p ? { path: p } : null;
    }
    const absolute = validPath(raw);
    if (absolute)
        return { path: absolute };
    if (!allowName || /[\\/:*?"<>|\x00-\x1f]/.test(raw) || raw === "." || raw === "..")
        return null;
    const name = raw.trim();
    const roots = ["S:\\", projectPath()].filter((p) => typeof p === "string");
    const matches = new Map();
    for (const root of roots) {
        try {
            const children = fs.readdirSync(root, { withFileTypes: true });
            for (const child of children) {
                if (!child.isDirectory())
                    continue;
                // Exact names only; do not guess from fuzzy / partial similarity.
                if (child.name.toLowerCase() !== name.toLowerCase())
                    continue;
                const full = path.win32.join(root, child.name);
                matches.set(full.toLowerCase(), full);
            }
        }
        catch { /* Missing or inaccessible search root is ignored. */ }
    }
    if (matches.size === 1)
        return { path: [...matches.values()][0] };
    if (matches.size > 1)
        return { ambiguous: `I found multiple folders named "${name}":\n${[...matches.values()].map(p => `- ${p}`).join("\n")}\nPlease specify the full path.` };
    return { ambiguous: `I couldn't find a folder named "${name}" directly inside S:\\ or your current project. Please provide its full path.` };
}
function safeChild(parent, nameInput) {
    const name = tidy(nameInput);
    if (!name || name.length > 100 || name === "." || name === ".." || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name))
        return null;
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name))
        return null;
    const destination = path.win32.join(parent, name);
    const rel = path.win32.relative(parent, destination);
    if (!rel || rel === ".." || rel.startsWith(`..${path.win32.sep}`) || path.win32.isAbsolute(rel))
        return null;
    return destination;
}
export function resolveFastFileCommand(input) {
    const text = input.trim();
    if (!text || text.length > 350 || /[\r\n]/.test(text) || BLOCKED.test(text))
        return { status: "unmatched" };
    const named = /^(?:please\s+)?(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory)\s+(?:named|called)\s+(.+?)\s+(?:inside|in|under)\s+(.+?)[!?]?$/i.exec(text);
    if (named) {
        // For writes, require explicit path or the exact current-project alias.
        const parent = resolveFolder(named[2], false);
        if (!parent || !("path" in parent))
            return { status: "unmatched" };
        const dest = safeChild(parent.path, named[1]);
        return dest ? { status: "matched", command: { toolName: "file_create_folder", args: { path: dest } } } : { status: "unmatched" };
    }
    const direct = /^(?:please\s+)?(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory)\s+(?:at\s+)?(.+?)[!?]?$/i.exec(text);
    if (direct) {
        const target = validPath(tidy(direct[1]));
        if (target && target !== path.win32.parse(target).root)
            return { status: "matched", command: { toolName: "file_create_folder", args: { path: target } } };
        return { status: "unmatched" };
    }
    const listing = /^(?:please\s+)?(?:list|show|display)(?:\s+me)?\s+(?:the\s+)?(?:files\s+and\s+folders|folders\s+and\s+files|files|folders|contents)\s+(?:in|inside|of|under)\s+(?:of\s+)?(.+?)[!?]?$/i.exec(text);
    if (listing) {
        const target = resolveFolder(listing[1], true);
        if (!target)
            return { status: "unmatched" };
        if ("ambiguous" in target)
            return { status: "ambiguous", message: target.ambiguous };
        return { status: "matched", command: { toolName: "file_list_files", args: { path: target.path } } };
    }
    const exists = /^(?:does\s+(.+?)\s+exist|check\s+(?:if|whether)\s+(.+?)\s+exists?)[!?]?$/i.exec(text);
    if (exists) {
        // Check explicit absolute paths and known project alias; don't guess.
        const target = resolveFolder(exists[1] ?? exists[2], false);
        if (target && "path" in target)
            return { status: "matched", command: { toolName: "file_exists", args: { path: target.path } } };
    }
    const read = /^(?:please\s+)?(?:read(?:\s+the)?(?:\s+file)?|show(?:\s+me)?\s+the\s+contents\s+of(?:\s+the\s+file)?)\s+(.+?)[!?]?$/i.exec(text);
    if (read) {
        const target = validPath(tidy(read[1]));
        if (target && /\.[A-Za-z0-9]{1,12}$/.test(target))
            return { status: "matched", command: { toolName: "file_read_file", args: { path: target } } };
    }
    return { status: "unmatched" };
}
// Backwards-compatible for callers that only need recognized commands.
export function detectFastFileCommand(input) {
    const resolution = resolveFastFileCommand(input);
    return resolution.status === "matched" ? resolution.command : null;
}
