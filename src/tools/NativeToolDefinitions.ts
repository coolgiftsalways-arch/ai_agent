import type { Tool } from "ollama";

export const agentTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "file_create_folder",
      description:
        "Create a folder on the computer inside an allowed location.",
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
        "Create a new file. Can optionally write initial content.",
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
];

export function mapNativeToolCall(
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
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

    case "terminal_run":
      return {
        tool: "terminal",
        action: "run",
        parameters: args,
      };

    default:
      return null;
  }
}