import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

import type {
  Tool,
  ToolResult,
} from "./Tool.js";

const execAsync = promisify(exec);


export class TerminalTool implements Tool {
  name = "terminal";

  private allowedRoots: string[];

  /*
  ==========================================
  ALLOWED COMMAND FAMILIES
  ==========================================

  Terminal is intended primarily for
  development commands.

  We intentionally do NOT allow arbitrary
  shells such as:

  powershell
  cmd /c
  bash
  wsl

  because those could bypass the security
  checks in this tool.
  */

  private readonly allowedExecutables =
    new Set([
      "node",
      "node.exe",

      "npm",
      "npm.cmd",

      "npx",
      "npx.cmd",

      "git",
      "git.exe",

      "pnpm",
      "pnpm.cmd",

      "yarn",
      "yarn.cmd",

      "tsc",
      "tsc.cmd",

      "tsx",
      "tsx.cmd",
    ]);


  /*
  ==========================================
  ALLOWED NPX TOOLS
  ==========================================

  npx can execute arbitrary packages.

  Therefore we allow only development tools
  that we explicitly trust for this agent.

  Add more later when required.
  */

  private readonly allowedNpxTools =
    new Set([
      "tsx",
      "tsc",
      "vite",
      "eslint",
      "prettier",
      "jest",
      "vitest",
      "nodemon",
      "next",
      "prisma",
      "tailwindcss",
    ]);


  constructor(
    allowedRoots: string[] = [
      process.cwd(),
      "S:\\",
    ]
  ) {
    this.allowedRoots =
      allowedRoots.map(
        (root) =>
          path.resolve(root)
      );
  }


  /*
  ==========================================
  NORMALIZE PATH
  ==========================================
  */

  private normalizePath(
    value: string
  ): string {
    const resolved =
      path.resolve(value);

    if (
      process.platform === "win32"
    ) {
      return resolved.toLowerCase();
    }

    return resolved;
  }


  /*
  ==========================================
  REAL PATH
  ==========================================

  path.resolve() alone does not protect
  against junctions / symlinks.

  realpath() gives us the actual filesystem
  location when it exists.
  */

  private async getRealPath(
    value: string
  ): Promise<string> {
    try {
      const real =
        await fs.realpath(
          value
        );

      return this.normalizePath(
        real
      );
    } catch {
      return this.normalizePath(
        value
      );
    }
  }


  /*
  ==========================================
  CHECK ALLOWED DIRECTORY
  ==========================================
  */

  private async isAllowedDirectory(
    requestedPath: string
  ): Promise<boolean> {
    const requested =
      await this.getRealPath(
        requestedPath
      );

    for (
      const root
      of this.allowedRoots
    ) {
      const allowedRoot =
        await this.getRealPath(
          root
        );

      const relative =
        path.relative(
          allowedRoot,
          requested
        );

      if (
        relative === "" ||
        (
          !relative.startsWith(
            ".."
          ) &&
          !path.isAbsolute(
            relative
          )
        )
      ) {
        return true;
      }
    }

    return false;
  }


  /*
  ==========================================
  CHECK WORKING DIRECTORY EXISTS
  ==========================================
  */

  private async directoryExists(
    directory: string
  ): Promise<boolean> {
    try {
      const info =
        await fs.stat(
          directory
        );

      return info.isDirectory();
    } catch {
      return false;
    }
  }


  /*
  ==========================================
  GET FIRST COMMAND TOKEN
  ==========================================
  */

  private getFirstToken(
    command: string
  ): string {
    const value =
      command.trim();

    if (!value) {
      return "";
    }

    /*
    Handle:

    "C:\something\tool.exe" arg1

    Even though external drive paths are
    blocked separately.
    */

    if (
      value.startsWith('"')
    ) {
      const end =
        value.indexOf(
          '"',
          1
        );

      if (end > 1) {
        return value.slice(
          1,
          end
        );
      }
    }

    return (
      value.split(
        /\s+/
      )[0] ?? ""
    );
  }


  /*
  ==========================================
  COMMAND TOKENS
  ==========================================
  */

  private getCommandTokens(
    command: string
  ): string[] {
    /*
    This is intentionally a conservative
    tokenizer.

    It is only used for security checks,
    not for executing the command.
    */

    const matches =
      command.match(
        /"[^"]*"|'[^']*'|\S+/g
      ) ?? [];

    return matches.map(
      (token) => {
        const value =
          token.trim();

        if (
          value.length >= 2 &&
          (
            (
              value.startsWith('"') &&
              value.endsWith('"')
            ) ||
            (
              value.startsWith("'") &&
              value.endsWith("'")
            )
          )
        ) {
          return value.slice(
            1,
            -1
          );
        }

        return value;
      }
    );
  }


  /*
  ==========================================
  BLOCK SHELL OPERATORS
  ==========================================

  We accept ONE command per terminal call.

  This blocks things such as:

  npm test && del ...
  node app.js | powershell ...
  npm test > C:\file.txt

  Multiple operations should be separate
  agent tool calls.
  */

  private containsShellOperators(
    command: string
  ): boolean {
    return /[&|;<>]/.test(
      command
    );
  }


  /*
  ==========================================
  BLOCK CONTROL CHARACTERS
  ==========================================
  */

  private containsControlCharacters(
    command: string
  ): boolean {
    return /[\u0000-\u001F\u007F]/.test(
      command
    );
  }


  /*
  ==========================================
  BLOCK ENVIRONMENT VARIABLE ESCAPES
  ==========================================

  Examples:

  %SystemRoot%
  %TEMP%
  $env:SystemRoot

  These could hide paths outside the
  allowed workspace.
  */

  private containsEnvironmentExpansion(
    command: string
  ): boolean {
    return (
      /%[^%]+%/.test(
        command
      ) ||
      /\$env:/i.test(
        command
      )
    );
  }


  /*
  ==========================================
  BLOCK OTHER DRIVE PATHS
  ==========================================

  Current agent workspace is S:\.

  If a command explicitly mentions another
  drive such as C:\ or D:\, it is blocked
  unless that drive belongs to an allowed
  root.

  Example:

  node C:\Windows\something.js

  → blocked
  */

  private referencesBlockedDrive(
    command: string
  ): boolean {
    const allowedDrives =
      new Set<string>();

    for (
      const root
      of this.allowedRoots
    ) {
      const parsed =
        path.parse(
          path.resolve(root)
        );

      const drive =
        parsed.root
          .slice(0, 2)
          .toLowerCase();

      if (
        /^[a-z]:$/i.test(
          drive
        )
      ) {
        allowedDrives.add(
          drive
        );
      }
    }

    const driveRegex =
      /\b([a-zA-Z]:)\\/g;

    let match:
      RegExpExecArray | null;

    while (
      (
        match =
          driveRegex.exec(
            command
          )
      ) !== null
    ) {
      const drive =
        match[1]
          .toLowerCase();

      if (
        !allowedDrives.has(
          drive
        )
      ) {
        return true;
      }
    }

    return false;
  }


  /*
  ==========================================
  BLOCK UNC / NETWORK PATHS
  ==========================================

  Prevent commands from escaping to:

  \\server\share
  */

  private referencesNetworkPath(
    command: string
  ): boolean {
    return /\\\\[^\\\s]+\\[^\\\s]+/.test(
      command
    );
  }


  /*
  ==========================================
  DANGEROUS COMMAND CHECK
  ==========================================
  */

  private getDangerReason(
    command: string
  ): string | null {
    const value =
      command
        .trim()
        .toLowerCase();


    if (!value) {
      return (
        "Command cannot be empty."
      );
    }


    /*
    ------------------------------------------
    CONTROL CHARACTERS
    ------------------------------------------
    */

    if (
      this.containsControlCharacters(
        command
      )
    ) {
      return (
        "Control characters are not allowed in terminal commands."
      );
    }


    /*
    ------------------------------------------
    SHELL CHAINING / REDIRECTION
    ------------------------------------------
    */

    if (
      this.containsShellOperators(
        command
      )
    ) {
      return (
        "Shell chaining, pipes and redirection are not allowed."
      );
    }


    /*
    ------------------------------------------
    ENVIRONMENT VARIABLE PATH BYPASS
    ------------------------------------------
    */

    if (
      this.containsEnvironmentExpansion(
        command
      )
    ) {
      return (
        "Environment-variable expansion is not allowed in terminal commands."
      );
    }


    /*
    ------------------------------------------
    OTHER DRIVE
    ------------------------------------------
    */

    if (
      this.referencesBlockedDrive(
        command
      )
    ) {
      return (
        "Command references a drive outside the allowed workspace."
      );
    }


    /*
    ------------------------------------------
    NETWORK PATH
    ------------------------------------------
    */

    if (
      this.referencesNetworkPath(
        command
      )
    ) {
      return (
        "Network and UNC paths are not allowed."
      );
    }


    /*
    ------------------------------------------
    HIGH-RISK WINDOWS COMMANDS
    ------------------------------------------
    */

    const blockedPatterns: {
      pattern: RegExp;
      reason: string;
    }[] = [
      {
        pattern:
          /\bformat(?:\.com)?\b/i,

        reason:
          "Drive formatting is blocked.",
      },

      {
        pattern:
          /\bdiskpart\b/i,

        reason:
          "Disk management commands are blocked.",
      },

      {
        pattern:
          /\bshutdown\b/i,

        reason:
          "Shutdown commands are blocked.",
      },

      {
        pattern:
          /\brestart-computer\b/i,

        reason:
          "Restart commands are blocked.",
      },

      {
        pattern:
          /\bstop-computer\b/i,

        reason:
          "Shutdown commands are blocked.",
      },

      {
        pattern:
          /\bbcdedit\b/i,

        reason:
          "Boot configuration commands are blocked.",
      },

      {
        pattern:
          /\bbootrec\b/i,

        reason:
          "Boot repair commands are blocked.",
      },

      {
        pattern:
          /\bfsutil\b/i,

        reason:
          "Low-level filesystem commands are blocked.",
      },

      {
        pattern:
          /\bmountvol\b/i,

        reason:
          "Volume management commands are blocked.",
      },

      {
        pattern:
          /\bvssadmin\b/i,

        reason:
          "Volume shadow-copy commands are blocked.",
      },

      {
        pattern:
          /\bwbadmin\b/i,

        reason:
          "System backup administration commands are blocked.",
      },

      {
        pattern:
          /\bcipher\s+\/w\b/i,

        reason:
          "Disk wiping commands are blocked.",
      },

      {
        pattern:
          /\breg(?:\.exe)?\b/i,

        reason:
          "Registry modification commands are blocked.",
      },

      {
        pattern:
          /\bregedit\b/i,

        reason:
          "Registry modification commands are blocked.",
      },

      {
        pattern:
          /\bsc(?:\.exe)?\s+/i,

        reason:
          "Windows service modification commands are blocked.",
      },

      {
        pattern:
          /\bschtasks\b/i,

        reason:
          "Scheduled-task modification is blocked.",
      },

      {
        pattern:
          /\bnetsh\b/i,

        reason:
          "Network configuration commands are blocked.",
      },

      {
        pattern:
          /\btakeown\b/i,

        reason:
          "Ownership modification commands are blocked.",
      },

      {
        pattern:
          /\bicacls\b/i,

        reason:
          "Permission modification commands are blocked.",
      },

      {
        pattern:
          /\btaskkill\b/i,

        reason:
          "Process termination commands are blocked.",
      },


      /*
      ----------------------------------------
      SHELL ESCAPE COMMANDS
      ----------------------------------------
      */

      {
        pattern:
          /\bpowershell(?:\.exe)?\b/i,

        reason:
          "Nested PowerShell execution is blocked.",
      },

      {
        pattern:
          /\bpwsh(?:\.exe)?\b/i,

        reason:
          "Nested PowerShell execution is blocked.",
      },

      {
        pattern:
          /\bcmd(?:\.exe)?\b/i,

        reason:
          "Nested Command Prompt execution is blocked.",
      },

      {
        pattern:
          /\bwsl(?:\.exe)?\b/i,

        reason:
          "WSL shell execution is blocked.",
      },

      {
        pattern:
          /\bbash(?:\.exe)?\b/i,

        reason:
          "Nested shell execution is blocked.",
      },


      /*
      ----------------------------------------
      DIRECT FILE-DELETION COMMANDS
      ----------------------------------------

      File deletion must go through FileTool
      + PermissionManager instead.
      */

      {
        pattern:
          /(^|\s)del(?:\.exe)?(\s|$)/i,

        reason:
          "Terminal file deletion is blocked. Use FileTool.",
      },

      {
        pattern:
          /(^|\s)erase(\s|$)/i,

        reason:
          "Terminal file deletion is blocked. Use FileTool.",
      },

      {
        pattern:
          /(^|\s)rd(\s|$)/i,

        reason:
          "Terminal folder deletion is blocked. Use FileTool.",
      },

      {
        pattern:
          /(^|\s)rmdir(\s|$)/i,

        reason:
          "Terminal folder deletion is blocked. Use FileTool.",
      },

      {
        pattern:
          /\bremove-item\b/i,

        reason:
          "Terminal file deletion is blocked. Use FileTool.",
      },

      {
        pattern:
          /(^|\s)rm(\s|$)/i,

        reason:
          "Terminal file deletion is blocked. Use FileTool.",
      },


      /*
      ----------------------------------------
      DOWNLOAD / REMOTE EXECUTION UTILITIES
      ----------------------------------------
      */

      {
        pattern:
          /\bcurl(?:\.exe)?\b/i,

        reason:
          "Direct terminal downloads are blocked.",
      },

      {
        pattern:
          /\bwget(?:\.exe)?\b/i,

        reason:
          "Direct terminal downloads are blocked.",
      },

      {
        pattern:
          /\bcertutil\b/i,

        reason:
          "certutil execution is blocked.",
      },
    ];


    for (
      const item
      of blockedPatterns
    ) {
      if (
        item.pattern.test(
          value
        )
      ) {
        return item.reason;
      }
    }


    /*
    ------------------------------------------
    EXECUTABLE ALLOWLIST
    ------------------------------------------
    */

    const firstToken =
      this.getFirstToken(
        command
      );

    const executable =
      path.win32
        .basename(
          firstToken
        )
        .toLowerCase();


    if (
      !this.allowedExecutables.has(
        executable
      )
    ) {
      return (
        `Terminal executable is not allowed: ${executable || firstToken}`
      );
    }


    /*
    ------------------------------------------
    NODE INLINE CODE
    ------------------------------------------

    node -e can execute arbitrary JavaScript
    and bypass FileTool protections.

    Running an actual project script remains
    allowed.
    */

    if (
      executable === "node" ||
      executable === "node.exe"
    ) {
      const tokens =
        this.getCommandTokens(
          command
        );

      const blockedNodeFlags =
        new Set([
          "-e",
          "--eval",
          "-p",
          "--print",
        ]);

      if (
        tokens.some(
          (token) =>
            blockedNodeFlags.has(
              token.toLowerCase()
            )
        )
      ) {
        return (
          "Inline Node.js code execution is blocked."
        );
      }
    }


    /*
    ------------------------------------------
    NPX PACKAGE ALLOWLIST
    ------------------------------------------
    */

    if (
      executable === "npx" ||
      executable === "npx.cmd"
    ) {
      const tokens =
        this.getCommandTokens(
          command
        );

      /*
      token 0 = npx
      token 1 = package/tool
      */

      const npxTool =
        (
          tokens[1] ?? ""
        )
          .toLowerCase();

      if (!npxTool) {
        return (
          "npx requires an explicitly allowed tool."
        );
      }

      if (
        npxTool.startsWith("-")
      ) {
        return (
          "npx options before the tool name are not allowed."
        );
      }

      if (
        !this.allowedNpxTools.has(
          npxTool
        )
      ) {
        return (
          `npx tool is not allowed: ${npxTool}`
        );
      }
    }


    /*
    ------------------------------------------
    NPM EXEC
    ------------------------------------------

    npm exec is effectively another arbitrary
    command runner.

    Use approved npx tools instead.
    */

    if (
      executable === "npm" ||
      executable === "npm.cmd"
    ) {
      const tokens =
        this.getCommandTokens(
          command
        );

      const action =
        (
          tokens[1] ?? ""
        )
          .toLowerCase();

      if (
        action === "exec"
      ) {
        return (
          "npm exec is blocked. Use an approved npx tool instead."
        );
      }
    }


    /*
    ------------------------------------------
    PNPM / YARN ARBITRARY EXECUTION
    ------------------------------------------
    */

    if (
      executable === "pnpm" ||
      executable === "pnpm.cmd" ||
      executable === "yarn" ||
      executable === "yarn.cmd"
    ) {
      const tokens =
        this.getCommandTokens(
          command
        );

      const action =
        (
          tokens[1] ?? ""
        )
          .toLowerCase();

      if (
        action === "dlx" ||
        action === "exec"
      ) {
        return (
          `${executable} ${action} is blocked because it can execute arbitrary tools.`
        );
      }
    }


    /*
    ------------------------------------------
    DANGEROUS GIT OPERATIONS
    ------------------------------------------
    */

    if (
      executable === "git" ||
      executable === "git.exe"
    ) {
      if (
        /\bgit\s+clean\b/i.test(
          value
        )
      ) {
        return (
          "git clean is blocked because it can permanently delete files."
        );
      }

      if (
        /\bgit\s+reset\s+--hard\b/i.test(
          value
        )
      ) {
        return (
          "git reset --hard is blocked because it can discard local work."
        );
      }

      if (
        /\bgit\s+push\b[\s\S]*(--force|-f)\b/i.test(
          value
        )
      ) {
        return (
          "Force-pushing is blocked."
        );
      }

      if (
        /\bgit\s+branch\s+-d\b/i.test(
          value
        ) ||
        /\bgit\s+branch\s+-D\b/.test(
          command
        )
      ) {
        return (
          "Forced/destructive branch deletion is blocked."
        );
      }
    }


    return null;
  }


  /*
  ==========================================
  RUN COMMAND
  ==========================================
  */

  async run(
    command: string,
    cwd = process.cwd()
  ): Promise<ToolResult> {
    /*
    ==========================================
    VALIDATE COMMAND
    ==========================================
    */

    const cleanedCommand =
      command.trim();

    if (!cleanedCommand) {
      return {
        success: false,

        message:
          "Command cannot be empty.",
      };
    }


    /*
    ==========================================
    RESOLVE WORKING DIRECTORY
    ==========================================

    Relative cwd values are resolved from
    the agent project process directory.

    Example:

    tests

    becomes:

    S:\ai-agent-project\tests
    */

    const workingDirectory =
      path.isAbsolute(
        cwd
      )
        ? path.resolve(cwd)
        : path.resolve(
            process.cwd(),
            cwd
          );


    /*
    ==========================================
    DIRECTORY MUST EXIST
    ==========================================
    */

    if (
      !(
        await this.directoryExists(
          workingDirectory
        )
      )
    ) {
      return {
        success: false,

        message:
          `Terminal working directory does not exist: ${workingDirectory}`,
      };
    }


    /*
    ==========================================
    ALLOWED WORKSPACE CHECK
    ==========================================
    */

    if (
      !(
        await this.isAllowedDirectory(
          workingDirectory
        )
      )
    ) {
      return {
        success: false,

        message:
          `Terminal access denied outside allowed folders: ${workingDirectory}`,
      };
    }


    /*
    ==========================================
    COMMAND SECURITY CHECK
    ==========================================
    */

    const dangerReason =
      this.getDangerReason(
        cleanedCommand
      );

    if (dangerReason) {
      return {
        success: false,

        message:
          `Terminal command blocked: ${dangerReason}`,
      };
    }


    /*
    ==========================================
    EXECUTE
    ==========================================
    */

    try {
      console.log(
        "\n💻 Running command:"
      );

      console.log(
        cleanedCommand
      );

      console.log(
        `📁 Directory: ${workingDirectory}`
      );


      const {
        stdout,
        stderr,
      } = await execAsync(
        cleanedCommand,
        {
          cwd:
            workingDirectory,

          windowsHide:
            true,

          /*
          Maximum runtime:
          5 minutes
          */

          timeout:
            1000 * 60 * 5,

          /*
          Maximum combined-ish command output
          buffer per stream.
          */

          maxBuffer:
            1024 *
            1024 *
            10,
        }
      );


      return {
        success: true,

        message:
          "Command completed successfully.",

        data: {
          command:
            cleanedCommand,

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
          `Command failed: ${cleanedCommand}`,

        data: {
          command:
            cleanedCommand,

          cwd:
            workingDirectory,

          stdout:
            String(
              error?.stdout ??
              ""
            ).trim(),

          stderr:
            String(
              error?.stderr ??
              error?.message ??
              error ??
              ""
            ).trim(),

          exitCode:
            error?.code,
        },
      };
    }
  }


  /*
  ==========================================
  EXECUTE TOOL ACTION
  ==========================================
  */

  async execute(
    action: string,
    parameters: Record<
      string,
      unknown
    >
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "run":
          return await this.run(
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