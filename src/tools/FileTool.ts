import fs from "fs/promises";
import path from "path";

import {
  Tool,
  ToolResult,
} from "./Tool.js";

export class FileTool implements Tool {
  name = "file";

  private allowedRoots: string[];

  constructor(
    allowedRoots: string[] = [process.cwd()]
  ) {
    this.allowedRoots = allowedRoots.map(
      (root) => path.resolve(root)
    );
  }

  private normalizeForComparison(
    value: string
  ) {
    const resolved = path.resolve(value);

    if (process.platform === "win32") {
      return resolved.toLowerCase();
    }

    return resolved;
  }

  private isAllowed(requestedPath: string): boolean {
  const requested = path.resolve(requestedPath);

  return this.allowedRoots.some((root) => {
    const allowedRoot = path.resolve(root);

    const relative = path.relative(
      allowedRoot,
      requested
    );

    return (
      relative === "" ||
      (
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
      )
    );
  });
}

  private resolveSafePath(
    requestedPath: string
  ): string {
    let finalPath: string;

    if (path.isAbsolute(requestedPath)) {
      finalPath =
        path.resolve(requestedPath);
    } else {
      finalPath = path.resolve(
        this.allowedRoots[0],
        requestedPath
      );
    }

    if (!this.isAllowed(finalPath)) {
      throw new Error(
        `Access denied. Path is outside allowed folders: ${finalPath}`
      );
    }

    return finalPath;
  }

  async createFolder(
    folderPath: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(folderPath);

    await fs.mkdir(safePath, {
      recursive: true,
    });

    return {
      success: true,
      message: `Folder created: ${safePath}`,
      data: {
        path: safePath,
      },
    };
  }

  async createFile(
    filePath: string,
    content = ""
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(filePath);

    await fs.mkdir(
      path.dirname(safePath),
      {
        recursive: true,
      }
    );

    try {
      await fs.writeFile(
        safePath,
        content,
        {
          encoding: "utf8",

          // Do not overwrite existing files.
          flag: "wx",
        }
      );
    } catch (error: any) {
      if (error.code === "EEXIST") {
        return {
          success: false,
          message: `File already exists: ${safePath}`,
        };
      }

      throw error;
    }

    return {
      success: true,
      message: `File created: ${safePath}`,
      data: {
        path: safePath,
      },
    };
  }

  async readFile(
    filePath: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(filePath);

    const content =
      await fs.readFile(
        safePath,
        "utf8"
      );

    return {
      success: true,
      message: `File read successfully: ${safePath}`,
      data: {
        path: safePath,
        content,
      },
    };
  }

  async writeFile(
    filePath: string,
    content: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(filePath);

    await fs.mkdir(
      path.dirname(safePath),
      {
        recursive: true,
      }
    );

    await fs.writeFile(
      safePath,
      content,
      "utf8"
    );

    return {
      success: true,
      message: `File written: ${safePath}`,
      data: {
        path: safePath,
      },
    };
  }

  async listFiles(
    folderPath = "."
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(folderPath);

    const entries =
      await fs.readdir(
        safePath,
        {
          withFileTypes: true,
        }
      );

    const files = entries.map(
      (entry) => ({
        name: entry.name,

        type: entry.isDirectory()
          ? "folder"
          : "file",
      })
    );

    return {
      success: true,
      message: `Found ${files.length} items.`,
      data: {
        path: safePath,
        items: files,
      },
    };
  }

  async fileExists(
    filePath: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(filePath);

    try {
      await fs.access(safePath);

      return {
        success: true,
        message: "Path exists.",
        data: {
          path: safePath,
          exists: true,
        },
      };
    } catch {
      return {
        success: true,
        message: "Path does not exist.",
        data: {
          path: safePath,
          exists: false,
        },
      };
    }
  }

  async renameFile(
    oldPath: string,
    newPath: string
  ): Promise<ToolResult> {
    const safeOld =
      this.resolveSafePath(oldPath);

    const safeNew =
      this.resolveSafePath(newPath);

    await fs.mkdir(
      path.dirname(safeNew),
      {
        recursive: true,
      }
    );

    await fs.rename(
      safeOld,
      safeNew
    );

    return {
      success: true,
      message:
        `Renamed:\n${safeOld}\n→ ${safeNew}`,
    };
  }

  async moveFile(
    oldPath: string,
    newPath: string
  ): Promise<ToolResult> {
    return this.renameFile(
      oldPath,
      newPath
    );
  }

  async deleteFile(
    filePath: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(filePath);

    await fs.unlink(safePath);

    return {
      success: true,
      message: `File deleted: ${safePath}`,
    };
  }

  async deleteFolder(
    folderPath: string
  ): Promise<ToolResult> {
    const safePath =
      this.resolveSafePath(folderPath);

    await fs.rm(
      safePath,
      {
        recursive: true,
        force: false,
      }
    );

    return {
      success: true,
      message: `Folder deleted: ${safePath}`,
    };
  }

  async execute(
    action: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "createFolder":
          return await this.createFolder(
            String(parameters.path)
          );

        case "createFile":
          return await this.createFile(
            String(parameters.path),

            parameters.content
              ? String(
                  parameters.content
                )
              : ""
          );

        case "readFile":
          return await this.readFile(
            String(parameters.path)
          );

        case "writeFile":
          return await this.writeFile(
            String(parameters.path),
            String(
              parameters.content ?? ""
            )
          );

        case "listFiles":
          return await this.listFiles(
            parameters.path
              ? String(parameters.path)
              : "."
          );

        case "fileExists":
          return await this.fileExists(
            String(parameters.path)
          );

        case "renameFile":
          return await this.renameFile(
            String(parameters.oldPath),
            String(parameters.newPath)
          );

        case "moveFile":
          return await this.moveFile(
            String(parameters.oldPath),
            String(parameters.newPath)
          );

        case "deleteFile":
          return await this.deleteFile(
            String(parameters.path)
          );

        case "deleteFolder":
          return await this.deleteFolder(
            String(parameters.path)
          );

        default:
          return {
            success: false,
            message:
              `Unknown FileTool action: ${action}`,
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