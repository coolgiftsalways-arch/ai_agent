import {
  MemoryDatabase,
  type MemoryType,
  type MemoryRecord,
} from "./MemoryDatabase.js";

export class MemoryManager {
  private database: MemoryDatabase;

  constructor() {
    this.database =
      new MemoryDatabase();
  }

  /*
  ==========================================
  SAVE MEMORY
  ==========================================
  */

  remember(
    type: MemoryType,
    content: string
  ): void {
    const cleaned =
      content.trim();

    if (!cleaned) {
      return;
    }

    this.database.addMemory(
      type,
      cleaned
    );
  }

  /*
  ==========================================
  SAVE SUCCESSFUL TOOL RESULT
  ==========================================
  */

  rememberToolResult(
    toolName: string,
    result: {
      success: boolean;
      message: string;
      data?: unknown;
    }
  ): void {
    // Only save successful real actions.
    if (!result.success) {
      return;
    }

    let memory =
      `${toolName}: ${result.message}`;

    if (
      result.data &&
      typeof result.data === "object"
    ) {
      const data =
        result.data as Record<
          string,
          unknown
        >;

      if (data.path) {
        memory +=
          ` | path=${String(
            data.path
          )}`;
      }

      if (data.oldPath) {
        memory +=
          ` | oldPath=${String(
            data.oldPath
          )}`;
      }

      if (data.newPath) {
        memory +=
          ` | newPath=${String(
            data.newPath
          )}`;
      }
    }

    this.remember(
      "tool",
      memory
    );
  }

  /*
  ==========================================
  GET MEMORY FOR CURRENT PROMPT
  ==========================================
  */

  getContextForPrompt(
    userInput: string
  ): string {
    const recent =
      this.database
        .getRecentMemories(10);

    const relevant =
      this.database
        .searchMemories(
          userInput,
          15
        );

    /*
    Remove duplicate memories.
    */

    const combined =
      new Map<
        number,
        MemoryRecord
      >();

    for (
      const memory of relevant
    ) {
      combined.set(
        memory.id,
        memory
      );
    }

    for (
      const memory of recent
    ) {
      combined.set(
        memory.id,
        memory
      );
    }

    const memories =
      Array.from(
        combined.values()
      )
        .sort(
          (a, b) =>
            a.id - b.id
        )
        .slice(-25);

    if (
      memories.length === 0
    ) {
      return "";
    }

    return memories
      .map(
        (memory) =>
          `[${memory.type.toUpperCase()}] ${memory.content}`
      )
      .join("\n");
  }

  /*
  ==========================================
  CLEAR ALL MEMORY
  ==========================================
  */

  clear(): void {
    this.database.clearMemory();
  }
}