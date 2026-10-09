import { z } from "zod";


export type ValidationResult =
  | {
      success: true;
      args: Record<string, unknown>;
    }
  | {
      success: false;
      message: string;
    };


/*
==================================================
COMMON VALIDATORS
==================================================
*/

const pathSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Path cannot be empty."
    )
    .max(
      4096,
      "Path is too long."
    );


const contentSchema =
  z
    .string()
    .max(
      2_000_000,
      "File content is too large."
    );


const memoryTextSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Memory text cannot be empty."
    )
    .max(
      20_000,
      "Memory text is too large."
    );


const commandSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Command cannot be empty."
    )
    .max(
      20_000,
      "Command is too long."
    );


const positiveIntegerSchema =
  z
    .number()
    .int()
    .positive();


/*
==================================================
FILE SCHEMAS
==================================================
*/

const createFolderSchema =
  z.object({
    path: pathSchema,
  });


const createFileSchema =
  z.object({
    path:
      pathSchema,

    content:
      contentSchema
        .optional()
        .default(""),
  });


const readFileSchema =
  z.object({
    path: pathSchema,
  });


const writeFileSchema =
  z.object({
    path:
      pathSchema,

    content:
      contentSchema,
  });


const listFilesSchema =
  z.object({
    path:
      pathSchema
        .optional()
        .default("."),
  });


const fileExistsSchema =
  z.object({
    path: pathSchema,
  });


const renameMoveSchema =
  z.object({
    oldPath:
      pathSchema,

    newPath:
      pathSchema,
  });


const deletePathSchema =
  z.object({
    path: pathSchema,
  });


/*
==================================================
TERMINAL SCHEMA
==================================================
*/

const terminalRunSchema =
  z.object({
    command:
      commandSchema,

    cwd:
      pathSchema
        .optional(),
  });


/*
==================================================
MEMORY SCHEMAS
==================================================
*/

const memoryRememberSchema =
  z.object({
    content:
      memoryTextSchema,
  });


const memorySearchSchema =
  z.object({
    query:
      memoryTextSchema,

    limit:
      z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10),
  });


const memoryRecentSchema =
  z.object({
    limit:
      z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10),
  });


const memoryForgetSchema =
  z.object({
    id:
      positiveIntegerSchema,
  });


/*
==================================================
SCHEMA LOOKUP
==================================================
*/

const schemas: Record<
  string,
  z.ZodTypeAny
> = {
  /*
  FILE
  */

  file_create_folder:
    createFolderSchema,

  file_create_file:
    createFileSchema,

  file_read_file:
    readFileSchema,

  file_write_file:
    writeFileSchema,

  file_list_files:
    listFilesSchema,

  file_exists:
    fileExistsSchema,

  file_rename:
    renameMoveSchema,

  file_move:
    renameMoveSchema,

  file_delete_file:
    deletePathSchema,

  file_delete_folder:
    deletePathSchema,


  /*
  TERMINAL
  */

  terminal_run:
    terminalRunSchema,


  /*
  MEMORY
  */

  memory_remember:
    memoryRememberSchema,

  memory_search:
    memorySearchSchema,

  memory_recent:
    memoryRecentSchema,

  memory_forget:
    memoryForgetSchema,
};


/*
==================================================
FORMAT VALIDATION ERROR
==================================================
*/

function formatValidationError(
  error: z.ZodError
): string {
  const messages =
    error.issues.map(
      (issue) => {
        const location =
          issue.path.length > 0
            ? issue.path.join(".")
            : "arguments";

        return (
          `${location}: ` +
          issue.message
        );
      }
    );

  return messages.join("; ");
}


/*
==================================================
VALIDATE NATIVE TOOL CALL
==================================================
*/

export function validateNativeToolCall(
  toolName: string,
  rawArgs: unknown
): ValidationResult {
  /*
  Reject tools which are not explicitly
  known to this validator.

  This is safer than letting an unexpected
  native tool continue automatically.
  */

  const schema =
    schemas[toolName];

  if (!schema) {
    return {
      success: false,

      message:
        `Validation blocked unknown tool: ${toolName}`,
    };
  }


  /*
  Arguments must be an object.
  */

  if (
    rawArgs === null ||
    typeof rawArgs !==
      "object" ||
    Array.isArray(
      rawArgs
    )
  ) {
    return {
      success: false,

      message:
        `Invalid arguments for ${toolName}: expected an object.`,
    };
  }


  const result =
    schema.safeParse(
      rawArgs
    );


  if (
    !result.success
  ) {
    return {
      success: false,

      message:
        `Invalid arguments for ${toolName}: ${formatValidationError(
          result.error
        )}`,
    };
  }


  return {
    success: true,

    args:
      result.data as Record<
        string,
        unknown
      >,
  };
}