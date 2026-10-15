export type PermissionLevel =
  | "safe"
  | "confirm"
  | "blocked";


type ApprovalFunction = (
  message: string
) => Promise<boolean>;


export class PermissionManager {
  private approvalFunction?: ApprovalFunction;


  private permissions: Record<
    string,
    PermissionLevel
  > = {
    /*
    ==========================================
    FILE
    ==========================================
    */

    "file.readFile":
      "safe",

    "file.listFiles":
      "safe",

    "file.fileExists":
      "safe",

    "file.createFile":
      "safe",

    "file.createFolder":
      "safe",

    "file.writeFile":
      "confirm",

    "file.renameFile":
      "confirm",

    "file.moveFile":
      "confirm",

    "file.deleteFile":
      "confirm",

    "file.deleteFolder":
      "confirm",


    /*
    ==========================================
    TERMINAL
    ==========================================
    */

    "terminal.run":
      "confirm",


    /*
    ==========================================
    MEMORY
    ==========================================
    */

    "memory.remember":
      "safe",

    "memory.search":
      "safe",

    "memory.recent":
      "safe",

    "memory.forget":
      "confirm",

    "memory.clearAll":
      "confirm",


    /*
    ==========================================
    GMAIL
    ==========================================
    */

    "gmail.recent":
      "safe",

    "gmail.search":
      "safe",

    "gmail.read":
      "safe",

    /*
    IMPORTANT:

    Sending email is NEVER automatic.

    Every real email send must pass through
    the approval function first.
    */

    "gmail.send":
      "confirm",


    /*
    ==========================================
    FUTURE WHATSAPP
    ==========================================
    */

    "whatsapp.read":
      "safe",

    "whatsapp.send":
      "confirm",
  };


  constructor(
    approvalFunction?: ApprovalFunction
  ) {
    this.approvalFunction =
      approvalFunction;
  }


  /*
  ==========================================
  BUILD APPROVAL MESSAGE
  ==========================================

  For sensitive actions such as Gmail send,
  show useful details before asking the user
  to approve the action.
  ==========================================
  */

  private buildApprovalMessage(
    permissionKey: string,
    parameters?: Record<
      string,
      unknown
    >
  ): string {
    /*
    ========================================
    GMAIL SEND
    ========================================
    */

    if (
      permissionKey ===
      "gmail.send"
    ) {
      const to =
        String(
          parameters?.to ??
          ""
        );

      const subject =
        String(
          parameters?.subject ??
          ""
        );

      const body =
        String(
          parameters?.body ??
          ""
        );


      return [
        "⚠️ Gmail send approval required",
        "",
        `To: ${to}`,
        `Subject: ${subject}`,
        "",
        "Message:",
        body,
        "",
        "Send this email?",
      ].join(
        "\n"
      );
    }


    /*
    ========================================
    DEFAULT CONFIRMATION
    ========================================
    */

    const details =
      parameters
        ? JSON.stringify(
            parameters,
            null,
            2
          )
        : "";


    return [
      "Allow action?",
      "",
      permissionKey,
      "",
      details,
    ]
      .filter(
        (value) =>
          value !== ""
      )
      .join(
        "\n"
      );
  }


  /*
  ==========================================
  AUTHORIZE ACTION
  ==========================================
  */

  async authorize(
    tool: string,
    action: string,
    parameters?: Record<
      string,
      unknown
    >
  ): Promise<boolean> {
    const permissionKey =
      `${tool}.${action}`;


    const level =
      this.permissions[
        permissionKey
      ] ??
      "confirm";


    /*
    ==========================================
    SAFE
    ==========================================
    */

    if (
      level ===
      "safe"
    ) {
      return true;
    }


    /*
    ==========================================
    BLOCKED
    ==========================================
    */

    if (
      level ===
      "blocked"
    ) {
      console.log(
        `🚫 BLOCKED: ${permissionKey}`
      );

      return false;
    }


    /*
    ==========================================
    CONFIRM REQUIRED
    ==========================================
    */

    if (
      !this.approvalFunction
    ) {
      console.log(
        `⚠️ Approval required: ${permissionKey}`
      );

      return false;
    }


    const approvalMessage =
      this.buildApprovalMessage(
        permissionKey,
        parameters
      );


    /*
    The real action will ONLY continue if
    the user explicitly approves it.
    */

    return await this.approvalFunction(
      approvalMessage
    );
  }


  /*
  ==========================================
  CHANGE PERMISSION
  ==========================================
  */

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