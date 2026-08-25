import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Tool } from "./Tool.js";

const execAsync = promisify(exec);

export class TerminalTool implements Tool {
  name = "terminal";

  description =
    "Run safe terminal commands inside the AI agent project workspace.";

  private workspace = path.resolve(process.cwd());

  async execute(input: string): Promise<string> {
    try {
      const data = JSON.parse(input);

      const command = data.command;

      if (!command || typeof command !== "string") {
        return "Error: command is required.";
      }

      const blockedCommands = [
        "format",
        "shutdown",
        "restart-computer",
        "remove-item",
        "del ",
        "rmdir",
        "rd ",
        "diskpart",
      ];

      const lowerCommand = command.toLowerCase();

      for (const blocked of blockedCommands) {
        if (lowerCommand.includes(blocked)) {
          return `Command blocked for safety: ${command}`;
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspace,
        timeout: 30_000,
        windowsHide: true,
      });

      return [
        stdout ? `STDOUT:\n${stdout}` : "",
        stderr ? `STDERR:\n${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      return `Terminal error: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}