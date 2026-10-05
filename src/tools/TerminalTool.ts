import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

import {
  Tool,
  ToolResult,
} from "./Tool.js";

const execAsync = promisify(exec);

export class TerminalTool implements Tool {
  name = "terminal";

  private allowedRoots: string[];

  constructor(
    allowedRoots: string[] = [
      process.cwd(),
      "S:\\",
    ]
  ) {
    this.allowedRoots =
      allowedRoots.map((root) =>
        path.resolve(root)
      );
  }

  private isAllowedDirectory(
    requestedPath: string
  ) {
    const requested =
      path.resolve(requestedPath);

    return this.allowedRoots.some(
      (root) => {
        const relative =
          path.relative(
            root,
            requested
          );

        return (
          relative === "" ||
          (
            !relative.startsWith("..") &&
            !path.isAbsolute(relative)
          )
        );
      }
    );
  }

  private isDangerousCommand(
    command: string
  ) {
    const value =
      command
        .trim()
        .toLowerCase();

    const blocked = [
      "format ",
      "diskpart",
      "shutdown",
      "restart-computer",
      "stop-computer",
      "bcdedit",
      "cipher /w",
      "del /s",
      "rd /s",
      "rmdir /s",
    ];

    return blocked.some(
      (item) =>
        value.includes(item)
    );
  }

  async run(
    command: string,
    cwd = process.cwd()
  ): Promise<ToolResult> {
    const workingDirectory =
      path.resolve(cwd);

    if (
      !this.isAllowedDirectory(
        workingDirectory
      )
    ) {
      return {
        success: false,
        message:
          `Terminal access denied outside allowed folders: ${workingDirectory}`,
      };
    }

    if (
      this.isDangerousCommand(
        command
      )
    ) {
      return {
        success: false,
        message:
          `Dangerous command blocked: ${command}`,
      };
    }

    try {
      console.log(
        `\n💻 Running command:`
      );

      console.log(command);

      console.log(
        `📁 Directory: ${workingDirectory}`
      );

      const {
        stdout,
        stderr,
      } = await execAsync(
        command,
        {
          cwd: workingDirectory,

          windowsHide: true,

          timeout:
            1000 * 60 * 5,

          maxBuffer:
            1024 * 1024 * 10,
        }
      );

      return {
        success: true,

        message:
          `Command completed successfully.`,

        data: {
          command,
          cwd:
            workingDirectory,

          stdout:
            stdout.trim(),

          stderr:
            stderr.trim(),
        },
      };
    } catch (error: any) {
      return {
        success: false,

        message:
          `Command failed: ${command}`,

        data: {
          command,
          cwd:
            workingDirectory,

          stdout:
            error.stdout ?? "",

          stderr:
            error.stderr ??
            error.message ??
            String(error),
        },
      };
    }
  }

  async execute(
    action: string,
    parameters: Record<
      string,
      unknown
    >
  ): Promise<ToolResult> {
    switch (action) {
      case "run":
        return this.run(
          String(
            parameters.command ??
            ""
          ),

          parameters.cwd
            ? String(
                parameters.cwd
              )
            : process.cwd()
        );

      default:
        return {
          success: false,

          message:
            `Unknown TerminalTool action: ${action}`,
        };
    }
  }
}