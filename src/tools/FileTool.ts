import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool } from "./Tool.js";

export class FileTool implements Tool {
  name = "file";

  description =
    "Create, read, write, and list files inside the AI agent workspace.";

  async execute(input: string): Promise<string> {
    try {
      const data = JSON.parse(input);

      const action = data.action;
      const filePath = data.path;

      if (!filePath) {
        return "Error: file path is required.";
      }

      const safePath = path.resolve(process.cwd(), filePath);

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