import type {
  Tool,
} from "ollama";


export const agentTools:
  Tool[] = [

  /*
  ==========================================
  FILE TOOLS
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "file_create_folder",

      description:
        "Create a directory inside an allowed location. Never use this to create a normal file.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",

            description:
              "Full Windows folder path.",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_create_file",

      description:
        "Create a file. Can optionally include initial content.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",

            description:
              "Full Windows file path.",
          },

          content: {
            type:
              "string",

            description:
              "Optional initial file content.",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_read_file",

      description:
        "Read the current contents of an existing file.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_write_file",

      description:
        "Replace or modify the contents of an existing file.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },

          content: {
            type:
              "string",
          },
        },

        required: [
          "path",
          "content",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_list_files",

      description:
        "List files and folders inside a directory.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_exists",

      description:
        "Check whether a file or folder currently exists.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_rename",

      description:
        "Rename a file or folder.",

      parameters: {
        type:
          "object",

        properties: {
          oldPath: {
            type:
              "string",
          },

          newPath: {
            type:
              "string",
          },
        },

        required: [
          "oldPath",
          "newPath",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_move",

      description:
        "Move a file or folder to another path.",

      parameters: {
        type:
          "object",

        properties: {
          oldPath: {
            type:
              "string",
          },

          newPath: {
            type:
              "string",
          },
        },

        required: [
          "oldPath",
          "newPath",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_delete_file",

      description:
        "Delete a file. Only use when the user explicitly requests deletion.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "file_delete_folder",

      description:
        "Delete a folder. Only use when the user explicitly requests deletion.",

      parameters: {
        type:
          "object",

        properties: {
          path: {
            type:
              "string",
          },
        },

        required: [
          "path",
        ],
      },
    },
  },




  /*
  ==========================================
  EXTENDED FILE TOOLS
  ==========================================
  */

  {
    type: "function",
    function: {
      name: "file_edit_file",
      description:
        "Precisely edit an existing text file by replacing an exact text passage. " +
        "Use instead of file_write_file when only part of a file should change. " +
        "The passage must exist exactly. Creates a recoverable backup. Requires approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Full absolute Windows path of the existing file to edit.",
          },
          search: {
            type: "string",
            description: "Exact existing text to replace, copied from verified file content. Must not be empty.",
          },
          replacement: {
            type: "string",
            description: "Exact replacement text. An empty string removes the matched passage.",
          },
          replaceAll: {
            type: "boolean",
            description: "Whether to replace every match. Default false; multiple matches are rejected otherwise.",
          },
        },
        required: ["path", "search", "replacement"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_search",
      description:
        "Search recursively for files or folders whose names contain a query. " +
        "Returns actual matching paths; does not search file contents or follow symbolic links.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute Windows directory path to search inside.",
          },
          query: {
            type: "string",
            description: "Non-empty filename or folder-name text to look for.",
          },
          maxResults: {
            type: "number",
            description: "Optional maximum results from 1 through 100; default 100.",
          },
        },
        required: ["path", "query"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_copy_file",
      description:
        "Copy a regular file to a new destination, leaving the original unchanged. " +
        "The destination must not already exist.",
      parameters: {
        type: "object",
        properties: {
          oldPath: {
            type: "string",
            description: "Absolute Windows path of the existing source file.",
          },
          newPath: {
            type: "string",
            description: "Absolute Windows path of the new destination file.",
          },
        },
        required: ["oldPath", "newPath"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_copy_folder",
      description:
        "Copy a folder and its supported contents to a new destination. " +
        "The destination must not already exist. Does not follow symbolic links.",
      parameters: {
        type: "object",
        properties: {
          oldPath: {
            type: "string",
            description: "Absolute Windows path of the existing source folder.",
          },
          newPath: {
            type: "string",
            description: "Absolute Windows path of the new destination folder.",
          },
        },
        required: ["oldPath", "newPath"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_restore",
      description:
        "Restore a deleted item, previous file version, or undo a move using a " +
        "recovery ID returned by a successful NEXA file operation. " +
        "Never invent recovery IDs. Requires approval.",
      parameters: {
        type: "object",
        properties: {
          recoveryId: {
            type: "string",
            description: "Exact recovery ID from a verified prior file tool result.",
          },
        },
        required: ["recoveryId"],
      },
    },
  },

  /*
  ==========================================
  TERMINAL TOOL
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "terminal_run",

      description:
        "Run a terminal command inside an allowed working directory. Use for npm, npx, node, git, builds and tests.",

      parameters: {
        type:
          "object",

        properties: {
          command: {
            type:
              "string",

            description:
              "Terminal command to execute.",
          },

          cwd: {
            type:
              "string",

            description:
              "Working directory for the command.",
          },
        },

        required: [
          "command",
          "cwd",
        ],
      },
    },
  },


  /*
  ==========================================
  MEMORY TOOLS
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "memory_remember",

      description:
        "Store information explicitly requested by the user in persistent memory.",

      parameters: {
        type:
          "object",

        properties: {
          content: {
            type:
              "string",

            description:
              "Information to store in long-term memory.",
          },
        },

        required: [
          "content",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "memory_search",

      description:
        "Search persistent long-term memory.",

      parameters: {
        type:
          "object",

        properties: {
          query: {
            type:
              "string",

            description:
              "Information to search for.",
          },

          limit: {
            type:
              "number",

            description:
              "Maximum number of results.",
          },
        },

        required: [
          "query",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "memory_recent",

      description:
        "Get recently stored persistent memories.",

      parameters: {
        type:
          "object",

        properties: {
          limit: {
            type:
              "number",
          },
        },
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "memory_forget",

      description:
        "Delete one specific persistent memory using its memory ID.",

      parameters: {
        type:
          "object",

        properties: {
          id: {
            type:
              "number",

            description:
              "Persistent memory ID.",
          },
        },

        required: [
          "id",
        ],
      },
    },
  },


  /*
  ==========================================
  GMAIL TOOLS
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "gmail_recent",

      description:
        "Get the user's latest Gmail inbox messages.",

      parameters: {
        type:
          "object",

        properties: {
          limit: {
            type:
              "number",

            description:
              "Maximum number of recent emails to return.",
          },
        },
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "gmail_search",

      description:
        "Search the user's Gmail using a Gmail search query.",

      parameters: {
        type:
          "object",

        properties: {
          query: {
            type:
              "string",

            description:
              "Gmail search query such as from:person@gmail.com, subject:invoice, or newer_than:7d.",
          },

          limit: {
            type:
              "number",

            description:
              "Maximum number of matching emails.",
          },
        },

        required: [
          "query",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "gmail_read",

      description:
        "Read one Gmail message using its exact Gmail message ID.",

      parameters: {
        type:
          "object",

        properties: {
          id: {
            type:
              "string",

            description:
              "Exact Gmail message ID returned by gmail_recent or gmail_search.",
          },
        },

        required: [
          "id",
        ],
      },
    },
  },


  {
    type:
      "function",

    function: {
      name:
        "gmail_send",

      description:
        "Send a real Gmail message to one or more recipients. Only use after the user explicitly asks to send an email. The action requires user approval before execution.",

      parameters: {
        type:
          "object",

        properties: {
          to: {
            type:
              "string",

            description:
              "One or more real recipient email addresses. For multiple recipients use a comma-separated string, for example: first@gmail.com, second@gmail.com. Maximum 20 recipients.",
          },

          subject: {
            type:
              "string",

            description:
              "Exact email subject.",
          },

          body: {
            type:
              "string",

            description:
              "Exact email message body.",
          },
        },

        required: [
          "to",
          "subject",
          "body",
        ],
      },
    },
  },
];


/*
==========================================
MAP NATIVE TOOL CALLS
==========================================
*/

export function mapNativeToolCall(
  name:
    string,

  args:
    Record<
      string,
      unknown
    >
) {
  switch (
    name
  ) {
    /*
    ========================================
    FILE
    ========================================
    */

    case "file_create_folder":
      return {
        tool:
          "file",

        action:
          "createFolder",

        parameters:
          args,
      };


    case "file_create_file":
      return {
        tool:
          "file",

        action:
          "createFile",

        parameters:
          args,
      };


    case "file_read_file":
      return {
        tool:
          "file",

        action:
          "readFile",

        parameters:
          args,
      };


    case "file_write_file":
      return {
        tool:
          "file",

        action:
          "writeFile",

        parameters:
          args,
      };


    case "file_list_files":
      return {
        tool:
          "file",

        action:
          "listFiles",

        parameters:
          args,
      };


    case "file_exists":
      return {
        tool:
          "file",

        action:
          "fileExists",

        parameters:
          args,
      };


    case "file_rename":
      return {
        tool:
          "file",

        action:
          "renameFile",

        parameters:
          args,
      };


    case "file_move":
      return {
        tool:
          "file",

        action:
          "moveFile",

        parameters:
          args,
      };


    case "file_delete_file":
      return {
        tool:
          "file",

        action:
          "deleteFile",

        parameters:
          args,
      };


    case "file_delete_folder":
      return {
        tool:
          "file",

        action:
          "deleteFolder",

        parameters:
          args,
      };


    /*
    ========================================
    TERMINAL
    ========================================
    */


    case "file_edit_file":
      return {
        tool: "file",
        action: "editFile",
        parameters: args,
      };

    case "file_search":
      return {
        tool: "file",
        action: "searchFiles",
        parameters: args,
      };

    case "file_copy_file":
      return {
        tool: "file",
        action: "copyFile",
        parameters: args,
      };

    case "file_copy_folder":
      return {
        tool: "file",
        action: "copyFolder",
        parameters: args,
      };

    case "file_restore":
      return {
        tool: "file",
        action: "restoreFile",
        parameters: args,
      };

    case "terminal_run":
      return {
        tool:
          "terminal",

        action:
          "run",

        parameters:
          args,
      };


    /*
    ========================================
    MEMORY
    ========================================
    */

    case "memory_remember":
      return {
        tool:
          "memory",

        action:
          "remember",

        parameters:
          args,
      };


    case "memory_search":
      return {
        tool:
          "memory",

        action:
          "search",

        parameters:
          args,
      };


    case "memory_recent":
      return {
        tool:
          "memory",

        action:
          "recent",

        parameters:
          args,
      };


    case "memory_forget":
      return {
        tool:
          "memory",

        action:
          "forget",

        parameters:
          args,
      };


    /*
    ========================================
    GMAIL
    ========================================
    */

    case "gmail_recent":
      return {
        tool:
          "gmail",

        action:
          "recent",

        parameters:
          args,
      };


    case "gmail_search":
      return {
        tool:
          "gmail",

        action:
          "search",

        parameters:
          args,
      };


    case "gmail_read":
      return {
        tool:
          "gmail",

        action:
          "read",

        parameters:
          args,
      };


    case "gmail_send":
      return {
        tool:
          "gmail",

        action:
          "send",

        parameters:
          args,
      };


    default:
      return null;
  }
}