import type {
  Tool,
  ToolResult,
} from "./Tool.js";

import {
  MemoryManager,
} from "../memory/MemoryManager.js";

export class MemoryTool
  implements Tool {
  name = "memory";

  constructor(
    private memoryManager:
      MemoryManager
  ) {}

  /*
  ==========================================
  REMEMBER SOMETHING
  ==========================================
  */

  async remember(
    content: string
  ): Promise<ToolResult> {
    const cleaned =
      content.trim();

    if (!cleaned) {
      return {
        success: false,
        message:
          "Memory content is empty.",
      };
    }

    this.memoryManager
      .rememberImportant(
        cleaned
      );

    return {
      success: true,

      message:
        "Memory saved successfully.",

      data: {
        content:
          cleaned,
      },
    };
  }

  /*
  ==========================================
  SEARCH MEMORY
  ==========================================
  */

  async search(
    query: string,
    limit = 10
  ): Promise<ToolResult> {
    const memories =
      this.memoryManager
        .search(
          query,
          limit
        );

    return {
      success: true,

      message:
        `Found ${memories.length} matching memories.`,

      data: {
        query,
        memories,
      },
    };
  }

  /*
  ==========================================
  RECENT MEMORIES
  ==========================================
  */

  async recent(
    limit = 10
  ): Promise<ToolResult> {
    const memories =
      this.memoryManager
        .recent(limit);

    return {
      success: true,

      message:
        `Found ${memories.length} recent memories.`,

      data: {
        memories,
      },
    };
  }

  /*
  ==========================================
  FORGET ONE MEMORY
  ==========================================
  */

  async forget(
    id: number
  ): Promise<ToolResult> {
    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return {
        success: false,
        message:
          "Invalid memory ID.",
      };
    }

    const deleted =
      this.memoryManager
        .forget(id);

    if (!deleted) {
      return {
        success: false,

        message:
          `Memory ID ${id} was not found.`,
      };
    }

    return {
      success: true,

      message:
        `Memory ID ${id} was forgotten.`,
    };
  }

  /*
  ==========================================
  CLEAR ALL MEMORY
  ==========================================
  */

  async clearAll():
    Promise<ToolResult> {
    this.memoryManager.clear();

    return {
      success: true,

      message:
        "All persistent memories were cleared.",
    };
  }

  /*
  ==========================================
  EXECUTE
  ==========================================
  */

  async execute(
    action: string,
    parameters:
      Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "remember":
          return await this.remember(
            String(
              parameters.content ??
              ""
            )
          );

        case "search":
          return await this.search(
            String(
              parameters.query ??
              ""
            ),

            parameters.limit
              ? Number(
                  parameters.limit
                )
              : 10
          );

        case "recent":
          return await this.recent(
            parameters.limit
              ? Number(
                  parameters.limit
                )
              : 10
          );

        case "forget":
          return await this.forget(
            Number(
              parameters.id
            )
          );

        case "clearAll":
          return await this.clearAll();

        default:
          return {
            success: false,

            message:
              `Unknown MemoryTool action: ${action}`,
          };
      }
    } catch (error) {
      return {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}