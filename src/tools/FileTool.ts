import fs from "fs/promises";
import path from "path";

import type {
  Tool,
  ToolResult,
} from "./Tool.js";


export class FileTool implements Tool {
  name = "file";

  private allowedRoots: string[];


  constructor(
    allowedRoots: string[] = [
      process.cwd(),
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
  NORMALIZE PATH FOR COMPARISON
  ==========================================
  */

  private normalizeForComparison(
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
  CHECK IF PATH IS INSIDE ROOT
  ==========================================
  */

  private isInsideRoot(
    candidate: string,
    root: string
  ): boolean {
    const normalizedCandidate =
      this.normalizeForComparison(
        candidate
      );

    const normalizedRoot =
      this.normalizeForComparison(
        root
      );

    const relative =
      path.relative(
        normalizedRoot,
        normalizedCandidate
      );

    return (
      relative === "" ||
      (
        !relative.startsWith(
          ".."
        ) &&
        !path.isAbsolute(
          relative
        )
      )
    );
  }


  /*
  ==========================================
  LEXICAL ALLOWED PATH CHECK
  ==========================================

  Blocks obvious paths such as:

  C:\Windows

  before touching the filesystem.
  */

  private isLexicallyAllowed(
    requestedPath: string
  ): boolean {
    const requested =
      path.resolve(
        requestedPath
      );

    return this.allowedRoots.some(
      (root) =>
        this.isInsideRoot(
          requested,
          root
        )
    );
  }


  /*
  ==========================================
  RESOLVE LEXICAL PATH
  ==========================================
  */

  private resolveLexicalPath(
    requestedPath: string
  ): string {
    let finalPath: string;

    if (
      path.isAbsolute(
        requestedPath
      )
    ) {
      finalPath =
        path.resolve(
          requestedPath
        );
    } else {
      finalPath =
        path.resolve(
          this.allowedRoots[0],
          requestedPath
        );
    }

    if (
      !this.isLexicallyAllowed(
        finalPath
      )
    ) {
      throw new Error(
        `Access denied. Path is outside allowed folders: ${finalPath}`
      );
    }

    return finalPath;
  }


  /*
  ==========================================
  GET REAL ALLOWED ROOTS
  ==========================================

  Windows junctions and symlinks can make
  a path LOOK like it is inside S:\ while
  actually pointing somewhere else.

  fs.realpath() reveals the real location.
  */

  private async getAllowedRealRoots():
    Promise<string[]> {
    const roots: string[] = [];

    for (
      const root
      of this.allowedRoots
    ) {
      try {
        const real =
          await fs.realpath(
            root
          );

        roots.push(
          this.normalizeForComparison(
            real
          )
        );
      } catch {
        /*
        Allowed roots should normally exist.

        If one does not, keep its resolved
        form rather than crashing setup.
        */

        roots.push(
          this.normalizeForComparison(
            root
          )
        );
      }
    }

    return roots;
  }


  /*
  ==========================================
  CHECK REAL PATH AGAINST ALLOWED ROOTS
  ==========================================
  */

  private async isRealPathAllowed(
    realPath: string
  ): Promise<boolean> {
    const allowedRealRoots =
      await this.getAllowedRealRoots();

    return allowedRealRoots.some(
      (root) =>
        this.isInsideRoot(
          realPath,
          root
        )
    );
  }


  /*
  ==========================================
  FIND NEAREST EXISTING ANCESTOR
  ==========================================

  Needed when creating:

  S:\Project\new\folder\file.txt

  The final file may not exist yet.

  We walk upward until an existing directory
  or filesystem entry is found, then verify
  its REAL location.
  */

  private async findNearestExistingAncestor(
    requestedPath: string
  ): Promise<string> {
    let current =
      path.resolve(
        requestedPath
      );

    while (true) {
      try {
        /*
        lstat does NOT silently follow a
        symlink/junction here.

        That is useful because a broken
        symlink should not be treated as a
        normal nonexistent path.
        */

        await fs.lstat(
          current
        );

        return current;
      } catch (error: any) {
        if (
          error?.code !== "ENOENT" &&
          error?.code !== "ENOTDIR"
        ) {
          throw error;
        }

        const parent =
          path.dirname(
            current
          );

        if (
          parent === current
        ) {
          throw new Error(
            `Unable to find an existing parent for path: ${requestedPath}`
          );
        }

        current =
          parent;
      }
    }
  }


  /*
  ==========================================
  REAL-PATH SECURITY CHECK
  ==========================================

  Example attack:

  S:\safe-link
      ↓ Windows junction
  C:\Windows

  Request:

  S:\safe-link\win.ini

  Lexically it looks safe.

  realpath() exposes C:\Windows and blocks it.
  */

  private async assertRealLocationAllowed(
    requestedPath: string
  ): Promise<void> {
    const existingAncestor =
      await this.findNearestExistingAncestor(
        requestedPath
      );

    let realAncestor: string;

    try {
      realAncestor =
        await fs.realpath(
          existingAncestor
        );
    } catch {
      /*
      An existing but unresolved symlink /
      junction is suspicious.

      Fail closed.
      */

      throw new Error(
        `Access denied. Unable to resolve real filesystem path: ${existingAncestor}`
      );
    }

    const allowed =
      await this.isRealPathAllowed(
        realAncestor
      );

    if (!allowed) {
      throw new Error(
        `Access denied. Real path escapes allowed folders: ${requestedPath} -> ${realAncestor}`
      );
    }
  }


  /*
  ==========================================
  EXISTING SAFE PATH
  ==========================================

  Used for:

  read
  list
  delete
  rename source
  move source
  */

  private async resolveExistingSafePath(
    requestedPath: string
  ): Promise<string> {
    const lexicalPath =
      this.resolveLexicalPath(
        requestedPath
      );

    /*
    Confirm entry exists.
    */

    await fs.lstat(
      lexicalPath
    );

    /*
    Confirm junction/symlink cannot escape.
    */

    await this.assertRealLocationAllowed(
      lexicalPath
    );

    return lexicalPath;
  }


  /*
  ==========================================
  TARGET SAFE PATH
  ==========================================

  Used for paths that may not exist yet:

  create
  write
  rename destination
  move destination
  existence checks
  */

  private async resolveTargetSafePath(
    requestedPath: string
  ): Promise<string> {
    const lexicalPath =
      this.resolveLexicalPath(
        requestedPath
      );

    await this.assertRealLocationAllowed(
      lexicalPath
    );

    return lexicalPath;
  }


  /*
  ==========================================
  ENSURE PARENT DIRECTORY EXISTS
  ==========================================
  */

  private async ensureParentDirectory(
    filePath: string
  ): Promise<void> {
    const parent =
      path.dirname(
        filePath
      );

    const root =
      path.parse(
        filePath
      ).root;

    if (
      path.resolve(parent) ===
      path.resolve(root)
    ) {
      return;
    }

    /*
    Verify parent destination before creating.
    */

    await this.resolveTargetSafePath(
      parent
    );

    await fs.mkdir(
      parent,
      {
        recursive: true,
      }
    );

    /*
    Verify again after creation.

    This is defense-in-depth against
    unexpected filesystem indirection.
    */

    await this.resolveExistingSafePath(
      parent
    );
  }


  /*
  ==========================================
  PROTECT IMPORTANT ROOTS
  ==========================================
  */

  private async isProtectedRoot(
    requestedPath: string
  ): Promise<boolean> {
    const normalized =
      this.normalizeForComparison(
        requestedPath
      );

    /*
    Protect configured lexical roots.
    */

    const lexicalMatch =
      this.allowedRoots.some(
        (root) =>
          this.normalizeForComparison(
            root
          ) ===
          normalized
      );

    if (lexicalMatch) {
      return true;
    }

    /*
    Also protect real versions of roots.
    */

    const realRoots =
      await this.getAllowedRealRoots();

    try {
      const realRequested =
        this.normalizeForComparison(
          await fs.realpath(
            requestedPath
          )
        );

      return realRoots.some(
        (root) =>
          root ===
          realRequested
      );
    } catch {
      return false;
    }
  }


  /*
  ==========================================
  CREATE FOLDER
  ==========================================
  */

  async createFolder(
    folderPath: string
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveTargetSafePath(
        folderPath
      );

    await fs.mkdir(
      safePath,
      {
        recursive: true,
      }
    );

    /*
    Verify the resulting real location.
    */

    await this.resolveExistingSafePath(
      safePath
    );

    return {
      success: true,

      message:
        `Folder created: ${safePath}`,

      data: {
        path:
          safePath,
      },
    };
  }


  /*
  ==========================================
  CREATE FILE
  ==========================================
  */

  async createFile(
    filePath: string,
    content = ""
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveTargetSafePath(
        filePath
      );

    await this.ensureParentDirectory(
      safePath
    );

    try {
      await fs.writeFile(
        safePath,
        content,
        {
          encoding:
            "utf8",

          /*
          Do NOT overwrite an existing file.
          */

          flag:
            "wx",
        }
      );
    } catch (error: any) {
      if (
        error?.code ===
        "EEXIST"
      ) {
        return {
          success: false,

          message:
            `File already exists: ${safePath}`,
        };
      }

      throw error;
    }

    /*
    Verify the resulting file did not resolve
    outside the allowed workspace.
    */

    await this.resolveExistingSafePath(
      safePath
    );

    return {
      success: true,

      message:
        `File created: ${safePath}`,

      data: {
        path:
          safePath,
      },
    };
  }


  /*
  ==========================================
  READ FILE
  ==========================================
  */

  async readFile(
    filePath: string
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveExistingSafePath(
        filePath
      );

    const content =
      await fs.readFile(
        safePath,
        "utf8"
      );

    return {
      success: true,

      message:
        `File read successfully: ${safePath}`,

      data: {
        path:
          safePath,

        content,
      },
    };
  }


  /*
  ==========================================
  WRITE / REPLACE FILE CONTENT
  ==========================================
  */

  async writeFile(
    filePath: string,
    content: string
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveTargetSafePath(
        filePath
      );

    await this.ensureParentDirectory(
      safePath
    );

    /*
    If the file already exists and is a
    junction/symlink, resolveTargetSafePath()
    already checked its real location.
    */

    await fs.writeFile(
      safePath,
      content,
      {
        encoding:
          "utf8",
      }
    );

    await this.resolveExistingSafePath(
      safePath
    );

    return {
      success: true,

      message:
        `File written: ${safePath}`,

      data: {
        path:
          safePath,
      },
    };
  }


  /*
  ==========================================
  LIST FILES
  ==========================================
  */

  async listFiles(
    folderPath = "."
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveExistingSafePath(
        folderPath
      );

    const entries =
      await fs.readdir(
        safePath,
        {
          withFileTypes:
            true,
        }
      );

    const items =
      entries.map(
        (entry) => ({
          name:
            entry.name,

          type:
            entry.isDirectory()
              ? "folder"
              : entry.isSymbolicLink()
                ? "link"
                : "file",
        })
      );

    return {
      success: true,

      message:
        `Found ${items.length} items.`,

      data: {
        path:
          safePath,

        items,
      },
    };
  }


  /*
  ==========================================
  CHECK FILE / FOLDER EXISTS
  ==========================================
  */

  async fileExists(
    filePath: string
  ): Promise<ToolResult> {
    /*
    Even existence checks must not allow
    an outside-workspace junction escape.
    */

    const safePath =
      await this.resolveTargetSafePath(
        filePath
      );

    try {
      await fs.access(
        safePath
      );

      /*
      If it exists, verify the actual path.
      */

      await this.resolveExistingSafePath(
        safePath
      );

      return {
        success: true,

        message:
          "Path exists.",

        data: {
          path:
            safePath,

          exists:
            true,
        },
      };
    } catch (error: any) {
      /*
      Security failures must NOT be converted
      into a simple "does not exist".
      */

      const message =
        String(
          error?.message ??
          error ??
          ""
        );

      if (
        message
          .toLowerCase()
          .includes(
            "access denied"
          )
      ) {
        throw error;
      }

      return {
        success: true,

        message:
          "Path does not exist.",

        data: {
          path:
            safePath,

          exists:
            false,
        },
      };
    }
  }


  /*
  ==========================================
  RENAME FILE / FOLDER
  ==========================================

  Example:

  old:
  S:\react-app

  new:
  react-final

  Result:

  S:\react-final

  NOT:

  S:\ai-agent-project\react-final
  */

  async renameFile(
    oldPath: string,
    newPath: string
  ): Promise<ToolResult> {
    const safeOld =
      await this.resolveExistingSafePath(
        oldPath
      );

    let requestedNewPath: string;

    if (
      path.isAbsolute(
        newPath
      )
    ) {
      requestedNewPath =
        newPath;
    } else {
      /*
      Relative rename stays beside
      the original item.
      */

      requestedNewPath =
        path.resolve(
          path.dirname(
            safeOld
          ),
          newPath
        );
    }

    const safeNew =
      await this.resolveTargetSafePath(
        requestedNewPath
      );


    /*
    ==========================================
    PREVENT MOVING INSIDE ITSELF
    ==========================================
    */

    const relative =
      path.relative(
        this.normalizeForComparison(
          safeOld
        ),
        this.normalizeForComparison(
          safeNew
        )
      );

    if (
      relative !== "" &&
      !relative.startsWith(
        ".."
      ) &&
      !path.isAbsolute(
        relative
      )
    ) {
      return {
        success: false,

        message:
          `Cannot move a folder inside itself: ${safeOld} → ${safeNew}`,
      };
    }


    /*
    Do not allow renaming protected roots.
    */

    if (
      await this.isProtectedRoot(
        safeOld
      )
    ) {
      return {
        success: false,

        message:
          `Refusing to rename protected root: ${safeOld}`,
      };
    }


    await this.ensureParentDirectory(
      safeNew
    );


    await fs.rename(
      safeOld,
      safeNew
    );


    /*
    Verify destination after move.
    */

    await this.resolveExistingSafePath(
      safeNew
    );


    return {
      success: true,

      message:
        `Renamed:\n${safeOld}\n→ ${safeNew}`,

      data: {
        oldPath:
          safeOld,

        newPath:
          safeNew,
      },
    };
  }


  /*
  ==========================================
  MOVE FILE / FOLDER
  ==========================================
  */

  async moveFile(
    oldPath: string,
    newPath: string
  ): Promise<ToolResult> {
    return this.renameFile(
      oldPath,
      newPath
    );
  }


  /*
  ==========================================
  DELETE FILE
  ==========================================
  */

  async deleteFile(
    filePath: string
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveExistingSafePath(
        filePath
      );


    if (
      await this.isProtectedRoot(
        safePath
      )
    ) {
      return {
        success: false,

        message:
          `Refusing to delete protected root: ${safePath}`,
      };
    }


    await fs.unlink(
      safePath
    );


    return {
      success: true,

      message:
        `File deleted: ${safePath}`,

      data: {
        path:
          safePath,
      },
    };
  }


  /*
  ==========================================
  DELETE FOLDER
  ==========================================
  */

  async deleteFolder(
    folderPath: string
  ): Promise<ToolResult> {
    const safePath =
      await this.resolveExistingSafePath(
        folderPath
      );


    /*
    Never allow deleting:

    S:\

    or another configured allowed root such
    as the AI project itself.
    */

    if (
      await this.isProtectedRoot(
        safePath
      )
    ) {
      return {
        success: false,

        message:
          `Refusing to delete protected root: ${safePath}`,
      };
    }


    await fs.rm(
      safePath,
      {
        recursive:
          true,

        force:
          false,
      }
    );


    return {
      success: true,

      message:
        `Folder deleted: ${safePath}`,

      data: {
        path:
          safePath,
      },
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
      Record<
        string,
        unknown
      >
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "createFolder":
          return await this.createFolder(
            String(
              parameters.path
            )
          );


        case "createFile":
          return await this.createFile(
            String(
              parameters.path
            ),

            parameters.content !==
              undefined
              ? String(
                  parameters.content
                )
              : ""
          );


        case "readFile":
          return await this.readFile(
            String(
              parameters.path
            )
          );


        case "writeFile":
          return await this.writeFile(
            String(
              parameters.path
            ),

            String(
              parameters.content ??
              ""
            )
          );


        case "listFiles":
          return await this.listFiles(
            parameters.path
              ? String(
                  parameters.path
                )
              : "."
          );


        case "fileExists":
          return await this.fileExists(
            String(
              parameters.path
            )
          );


        case "renameFile":
          return await this.renameFile(
            String(
              parameters.oldPath
            ),

            String(
              parameters.newPath
            )
          );


        case "moveFile":
          return await this.moveFile(
            String(
              parameters.oldPath
            ),

            String(
              parameters.newPath
            )
          );


        case "deleteFile":
          return await this.deleteFile(
            String(
              parameters.path
            )
          );


        case "deleteFolder":
          return await this.deleteFolder(
            String(
              parameters.path
            )
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