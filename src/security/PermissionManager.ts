export type PermissionLevel =
  | "safe"
  | "confirm"
  | "blocked";

type ApprovalFunction = (
  message: string
) => Promise<boolean>;

export class PermissionManager {
  private approvalFunction?: ApprovalFunction;

  private permissions: Record<string, PermissionLevel> = {
    // FILE
    "file.readFile": "safe",
    "file.listFiles": "safe",
    "file.fileExists": "safe",

    "file.createFile": "safe",
    "file.createFolder": "safe",

    "file.writeFile": "confirm",
    "file.renameFile": "confirm",
    "file.moveFile": "confirm",

    "file.deleteFile": "confirm",
    "file.deleteFolder": "confirm",

    // TERMINAL
"terminal.run": "confirm",

// MEMORY
"memory.remember": "safe",
"memory.search": "safe",
"memory.recent": "safe",
"memory.forget": "confirm",
"memory.clearAll": "confirm",

// Future tools

    // Future tools
    "gmail.read": "safe",
    "gmail.send": "confirm",

    "whatsapp.read": "safe",
    "whatsapp.send": "confirm",
  };

  constructor(approvalFunction?: ApprovalFunction) {
    this.approvalFunction = approvalFunction;
  }

  async authorize(
    tool: string,
    action: string,
    parameters?: Record<string, unknown>
  ): Promise<boolean> {
    const permissionKey = `${tool}.${action}`;

    const level =
      this.permissions[permissionKey] ?? "confirm";

    if (level === "safe") {
      return true;
    }

    if (level === "blocked") {
      console.log(
        `🚫 BLOCKED: ${permissionKey}`
      );

      return false;
    }

    if (!this.approvalFunction) {
      console.log(
        `⚠️ Approval required: ${permissionKey}`
      );

      return false;
    }

    const details = parameters
      ? JSON.stringify(parameters, null, 2)
      : "";

    return this.approvalFunction(
      `Allow action?\n\n${permissionKey}\n\n${details}`
    );
  }

  setPermission(
    tool: string,
    action: string,
    level: PermissionLevel
  ) {
    this.permissions[
      `${tool}.${action}`
    ] = level;
  }
}