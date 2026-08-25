import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Tool } from "./Tool.js";

const execAsync = promisify(exec);

export class TerminalTool implements Tool {
  name = "terminal";

  description =
    "Run terminal commands inside the AI agent project workspace.";

  async execute(input: string): Promise<string> {
    try {
      const data = JSON.parse(input);

      if (!data.command || typeof data.command !== "string") {
        return "Error: command is required.";
      }

      const command = data.command.trim();

      if (!command) {
        return "Error: command cannot be empty.";
      }

      // Basic dangerous-command protection.
      const blockedPatterns = [
        /format\s+[a-z]:/i,
        /diskpart/i,
        /shutdown/i,
        /restart-computer/i,
        /stop-computer/i,
        /remove-item\s+.*-recurse/i,
        /del\s+\/s/i,
        /rd\s+\/s/i,
        /rmdir\s+\/s/i,
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(command)) {
          return "Error: this command is blocked for safety.";
        }
      }

      const workspace = path.resolve(process.cwd());

      const { stdout, stderr } = await execAsync(command, {
        cwd: workspace,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });

      let result = "";

      if (stdout.trim()) {
        result += `Output:\n${stdout.trim()}`;
      }

      if (stderr.trim()) {
        result += `${result ? "\n\n" : ""}Errors:\n${stderr.trim()}`;
      }

      return result || "Command completed successfully.";
    } catch (error) {
      return `Terminal tool error: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}