import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool } from "./Tool.js";

export class FileTool implements Tool {
  name = "file";

  description =
    "Create, write, read, and list files inside the AI agent workspace.";

  async execute(input: string): Promise<string> {
    try {
      const data = JSON.parse(input);

      const action = data.action;
      const filePath = data.path;

      if (!filePath || typeof filePath !== "string") {
        return "Error: file path is required.";
      }

      const workspace = path.resolve(process.cwd());
      const safePath = path.resolve(workspace, filePath);

      // Prevent the tool from accessing files outside the project.
      if (
        safePath !== workspace &&
        !safePath.startsWith(workspace + path.sep)
      ) {
        return "Error: file path is outside the agent workspace.";
      }

      switch (action) {
        case "write": {
          if (typeof data.content !== "string") {
            return "Error: content is required.";
          }

          await fs.writeFile(safePath, data.content, "utf8");

          return `File created successfully: ${filePath}`;
        }

        case "read": {
          const content = await fs.readFile(safePath, "utf8");

          return content;
        }

        case "list": {
          const files = await fs.readdir(safePath);

          return files.join("\n");
        }

        default:
          return `Unknown file action: ${action}`;
      }
    } catch (error) {
      return `File tool error: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}