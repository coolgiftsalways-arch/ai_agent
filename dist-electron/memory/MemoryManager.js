import { MemoryDatabase, } from "./MemoryDatabase.js";
export class MemoryManager {
    database;
    constructor() {
        this.database =
            new MemoryDatabase();
    }
    /*
    ==========================================
    SAVE MEMORY
    ==========================================
    */
    remember(type, content) {
        const cleaned = content.trim();
        if (!cleaned) {
            return;
        }
        this.database.addMemory(type, cleaned);
    }
    /*
    ==========================================
    SAVE EXPLICIT MEMORY
    ==========================================
    */
    rememberImportant(content) {
        this.remember("memory", content);
    }
    /*
    ==========================================
    SAVE SUCCESSFUL TOOL RESULT
    ==========================================
    */
    rememberToolResult(toolName, result) {
        if (!result.success) {
            return;
        }
        let memory = `${toolName}: ${result.message}`;
        if (result.data &&
            typeof result.data === "object") {
            const data = result.data;
            if (data.path) {
                memory +=
                    ` | path=${String(data.path)}`;
            }
            if (data.oldPath) {
                memory +=
                    ` | oldPath=${String(data.oldPath)}`;
            }
            if (data.newPath) {
                memory +=
                    ` | newPath=${String(data.newPath)}`;
            }
        }
        this.remember("tool", memory);
    }
    /*
    ==========================================
    SEARCH MEMORY
    ==========================================
    */
    search(query, limit = 10) {
        return this.database
            .searchImportantMemories(query, limit);
    }
    /*
    ==========================================
    GET RECENT MEMORY
    ==========================================
    */
    recent(limit = 10) {
        return this.database
            .getRecentMemories(limit);
    }
    /*
    ==========================================
    FORGET ONE MEMORY
    ==========================================
    */
    forget(id) {
        return this.database
            .deleteMemory(id);
    }
    /*
    ==========================================
    LONG-TERM CONTEXT FOR QWEN
    ==========================================
    */
    getContextForPrompt(userInput) {
        const recent = this.database
            .getRecentMemories(10);
        const relevant = this.database
            .searchMemories(userInput, 15);
        const combined = new Map();
        for (const memory of relevant) {
            combined.set(memory.id, memory);
        }
        for (const memory of recent) {
            combined.set(memory.id, memory);
        }
        const memories = Array.from(combined.values())
            .sort((a, b) => a.id - b.id)
            .slice(-25);
        if (memories.length === 0) {
            return "";
        }
        return memories
            .map((memory) => `[${memory.type.toUpperCase()}] ${memory.content}`)
            .join("\n");
    }
    /*
    ==========================================
    CLEAR EVERYTHING
    ==========================================
    */
    clear() {
        this.database.clearMemory();
    }
}
