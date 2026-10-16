export function formatFileResult(toolName, result) {
    if (!result.success)
        return `File operation failed: ${String(result.message ?? "Unknown error")}`;
    const data = result.data;
    if (toolName === "file_list_files") {
        if (!data || typeof data !== "object" || Array.isArray(data))
            return String(result.message ?? "Listing returned no data.");
        const listing = data;
        const folder = typeof listing.path === "string" ? listing.path : "Requested folder";
        if (!Array.isArray(listing.items))
            return `Could not interpret the listing for ${folder}.`;
        const items = listing.items.filter((x) => !!x && typeof x === "object" && typeof x.name === "string");
        if (!items.length)
            return `The folder ${folder} is empty.`;
        const folders = items.filter(x => x.type === "folder").sort((a, b) => a.name.localeCompare(b.name));
        const files = items.filter(x => x.type !== "folder").sort((a, b) => a.name.localeCompare(b.name));
        return `Contents of ${folder} (${folders.length} folders, ${files.length} files):\n\n` +
            [...folders.map(x => `📁 ${x.name}`), ...files.map(x => `📄 ${x.name}`)].join("\n");
    }
    if (toolName === "file_read_file") {
        if (typeof data === "string")
            return data;
        if (data && typeof data === "object" && !Array.isArray(data)) {
            const item = data;
            if (typeof item.content === "string")
                return `File: ${String(item.path ?? "requested file")}\n\n${item.content}`;
        }
        return String(result.message ?? "File read succeeded, but no readable content was returned.");
    }
    if (toolName === "file_exists") {
        if (data && typeof data === "object" && !Array.isArray(data)) {
            const d = data;
            if (typeof d.exists === "boolean")
                return d.exists ? `${String(d.path ?? "The path")} exists.` : `${String(d.path ?? "The path")} does not exist.`;
        }
    }
    return String(result.message ?? "File action completed.");
}
