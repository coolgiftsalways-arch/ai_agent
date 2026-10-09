import type { Tool } from "ollama";

export const agentTools: Tool[] = [
  /*
  ==========================================
  FILE TOOLS
  ==========================================
  */

  {
    type: "function",
    function: {
      name: "file_create_folder",

      description:
        "Create a DIRECTORY only inside an allowed location. Never use this tool to create a file such as .txt, .js, .ts, .tsx, .json, .html or .css.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",

            description:
              "Full Windows folder path. Example: S:\\MyFolder",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_create_file",

      description:
        "Create a FILE, not a folder. Use this for paths such as note.txt, App.tsx, package.json or index.html. Can optionally write initial content.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",

            description:
              "Full Windows file path.",
          },

          content: {
            type: "string",

            description:
              "Initial file content.",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_read_file",

      description:
        "Read the contents of an existing file.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",

            description:
              "Full Windows file path.",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_write_file",

      description:
        "Replace or modify the contents of an existing file.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",
          },

          content: {
            type: "string",
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
    type: "function",
    function: {
      name: "file_list_files",

      description:
        "List files and folders inside a directory.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_exists",

      description:
        "Check whether a file or folder exists.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_rename",

      description:
        "Rename a file or folder.",

      parameters: {
        type: "object",

        properties: {
          oldPath: {
            type: "string",
          },

          newPath: {
            type: "string",
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
    type: "function",
    function: {
      name: "file_move",

      description:
        "Move a file from one location to another.",

      parameters: {
        type: "object",

        properties: {
          oldPath: {
            type: "string",
          },

          newPath: {
            type: "string",
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
    type: "function",
    function: {
      name: "file_delete_file",

      description:
        "Delete a file. Only use when the user explicitly requests deletion.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "file_delete_folder",

      description:
        "Delete a folder. Only use when the user explicitly requests deletion.",

      parameters: {
        type: "object",

        properties: {
          path: {
            type: "string",
          },
        },

        required: ["path"],
      },
    },
  },

  /*
  ==========================================
  TERMINAL TOOL
  ==========================================
  */

  {
    type: "function",
    function: {
      name: "terminal_run",

      description:
        "Run a terminal command inside an allowed working directory. Use for npm, node, npx, git, builds and tests.",

      parameters: {
        type: "object",

        properties: {
          command: {
            type: "string",

            description:
              "Command to execute.",
          },

          cwd: {
            type: "string",

            description:
              "Working directory. Example: S:\\MyProject",
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
    type: "function",

    function: {
      name: "memory_remember",

      description:
        "Permanently remember an important fact, preference, project path, decision, instruction, or information explicitly requested by the user.",

      parameters: {
        type: "object",

        properties: {
          content: {
            type: "string",

            description:
              "The useful information that should be stored in long-term memory.",
          },
        },

        required: [
          "content",
        ],
      },
    },
  },

  {
    type: "function",

    function: {
      name: "memory_search",

      description:
        "Search the agent's persistent long-term memory for information related to a topic, project, path, person, decision, or previous task.",

      parameters: {
        type: "object",

        properties: {
          query: {
            type: "string",

            description:
              "What to search for in long-term memory.",
          },

          limit: {
            type: "number",

            description:
              "Maximum number of memories to return.",
          },
        },

        required: [
          "query",
        ],
      },
    },
  },

  {
    type: "function",

    function: {
      name: "memory_recent",

      description:
        "Get the most recently stored persistent memories.",

      parameters: {
        type: "object",

        properties: {
          limit: {
            type: "number",

            description:
              "Maximum number of recent memories to return.",
          },
        },
      },
    },
  },

  {
    type: "function",

    function: {
      name: "memory_forget",

      description:
        "Delete one specific persistent memory using its memory ID. Search memory first if the ID is unknown.",

      parameters: {
        type: "object",

        properties: {
          id: {
            type: "number",

            description:
              "The ID of the memory that should be forgotten.",
          },
        },

        required: [
          "id",
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
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    /*
    ========================================
    FILE
    ========================================
    */

    case "file_create_folder":
      return {
        tool: "file",
        action: "createFolder",
        parameters: args,
      };

    case "file_create_file":
      return {
        tool: "file",
        action: "createFile",
        parameters: args,
      };

    case "file_read_file":
      return {
        tool: "file",
        action: "readFile",
        parameters: args,
      };

    case "file_write_file":
      return {
        tool: "file",
        action: "writeFile",
        parameters: args,
      };

    case "file_list_files":
      return {
        tool: "file",
        action: "listFiles",
        parameters: args,
      };

    case "file_exists":
      return {
        tool: "file",
        action: "fileExists",
        parameters: args,
      };

    case "file_rename":
      return {
        tool: "file",
        action: "renameFile",
        parameters: args,
      };

    case "file_move":
      return {
        tool: "file",
        action: "moveFile",
        parameters: args,
      };

    case "file_delete_file":
      return {
        tool: "file",
        action: "deleteFile",
        parameters: args,
      };

    case "file_delete_folder":
      return {
        tool: "file",
        action: "deleteFolder",
        parameters: args,
      };

    /*
    ========================================
    TERMINAL
    ========================================
    */

    case "terminal_run":
      return {
        tool: "terminal",
        action: "run",
        parameters: args,
      };

    /*
    ========================================
    MEMORY
    ========================================
    */

    case "memory_remember":
      return {
        tool: "memory",
        action: "remember",
        parameters: args,
      };

    case "memory_search":
      return {
        tool: "memory",
        action: "search",
        parameters: args,
      };

    case "memory_recent":
      return {
        tool: "memory",
        action: "recent",
        parameters: args,
      };

    case "memory_forget":
      return {
        tool: "memory",
        action: "forget",
        parameters: args,
      };

    default:
      return null;
  }
}