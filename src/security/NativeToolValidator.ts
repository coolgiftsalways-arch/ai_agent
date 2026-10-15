import {
  z,
} from "zod";


/*
==========================================
COMMON SCHEMAS
==========================================
*/

const pathSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Path is required."
    )
    .max(
      32768,
      "Path is too long."
    );


const contentSchema =
  z
    .string()
    .max(
      2_000_000,
      "Content is too large."
    );


const commandSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Command is required."
    )
    .max(
      20_000,
      "Command is too long."
    );


const limitSchema =
  z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional();


/*
==========================================
GMAIL RECIPIENT VALIDATION
==========================================
*/

const gmailRecipientsSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "At least one recipient is required."
    )
    .max(
      7000,
      "Recipient list is too long."
    )
    .refine(
      (
        value
      ) =>
        !/[\r\n]/.test(
          value
        ),

      {
        message:
          "Recipients cannot contain line breaks.",
      }
    )
    .refine(
      (
        value
      ) => {
        const recipients =
          value
            .split(
              ","
            )
            .map(
              (
                item
              ) =>
                item.trim()
            )
            .filter(
              Boolean
            );


        if (
          recipients.length <
            1 ||
          recipients.length >
            20
        ) {
          return false;
        }


        return recipients.every(
          (
            email
          ) =>
            z
              .string()
              .email()
              .safeParse(
                email
              )
              .success
        );
      },

      {
        message:
          "Provide 1 to 20 valid recipient email addresses separated by commas.",
      }
    );


const gmailSubjectSchema =
  z
    .string()
    .trim()
    .min(
      1,
      "Email subject is required."
    )
    .max(
      500,
      "Email subject is too long."
    )
    .refine(
      (
        value
      ) =>
        !/[\r\n]/.test(
          value
        ),

      {
        message:
          "Email subject cannot contain line breaks.",
      }
    );


const gmailBodySchema =
  z
    .string()
    .max(
      200_000,
      "Email body is too large."
    )
    .refine(
      (
        value
      ) =>
        value
          .trim()
          .length >
        0,

      {
        message:
          "Email body cannot be empty.",
      }
    );


/*
==========================================
TOOL SCHEMAS
==========================================
*/

const toolSchemas = {
  /*
  ========================================
  FILE
  ========================================
  */

  file_create_folder:
    z.object({
      path:
        pathSchema,
    }),


  file_create_file:
    z.object({
      path:
        pathSchema,

      content:
        contentSchema
          .optional(),
    }),


  file_read_file:
    z.object({
      path:
        pathSchema,
    }),


  file_write_file:
    z.object({
      path:
        pathSchema,

      content:
        contentSchema,
    }),


  file_list_files:
    z.object({
      path:
        pathSchema,
    }),


  file_exists:
    z.object({
      path:
        pathSchema,
    }),


  file_rename:
    z.object({
      oldPath:
        pathSchema,

      newPath:
        pathSchema,
    }),


  file_move:
    z.object({
      oldPath:
        pathSchema,

      newPath:
        pathSchema,
    }),


  file_delete_file:
    z.object({
      path:
        pathSchema,
    }),


  file_delete_folder:
    z.object({
      path:
        pathSchema,
    }),


  /*
  ========================================
  TERMINAL
  ========================================
  */

  terminal_run:
    z.object({
      command:
        commandSchema,

      cwd:
        pathSchema,
    }),


  /*
  ========================================
  MEMORY
  ========================================
  */

  memory_remember:
    z.object({
      content:
        z
          .string()
          .trim()
          .min(
            1,
            "Memory content is required."
          )
          .max(
            100_000,
            "Memory content is too large."
          ),
    }),


  memory_search:
    z.object({
      query:
        z
          .string()
          .trim()
          .min(
            1,
            "Memory search query is required."
          )
          .max(
            10_000,
            "Memory search query is too long."
          ),

      limit:
        limitSchema,
    }),


  memory_recent:
    z.object({
      limit:
        limitSchema,
    }),


  memory_forget:
    z.object({
      id:
        z
          .number()
          .int()
          .positive(),
    }),


  /*
  ========================================
  GMAIL
  ========================================
  */

  gmail_recent:
    z.object({
      limit:
        limitSchema,
    }),


  gmail_search:
    z.object({
      query:
        z
          .string()
          .trim()
          .min(
            1,
            "Gmail search query is required."
          )
          .max(
            5000,
            "Gmail search query is too long."
          ),

      limit:
        limitSchema,
    }),


  gmail_read:
    z.object({
      id:
        z
          .string()
          .trim()
          .min(
            1,
            "Gmail message ID is required."
          )
          .max(
            500,
            "Gmail message ID is too long."
          ),
    }),


  gmail_send:
    z.object({
      /*
      One string is deliberately used.

      Example:

      user1@gmail.com, user2@gmail.com
      */

      to:
        gmailRecipientsSchema,

      subject:
        gmailSubjectSchema,

      body:
        gmailBodySchema,
    }),
};


/*
==========================================
VALIDATION RESULT
==========================================
*/

export type NativeToolValidationResult =
  | {
      success: true;

      args:
        Record<
          string,
          unknown
        >;
    }

  | {
      success: false;

      message:
        string;
    };


/*
==========================================
FORMAT ZOD ERROR
==========================================
*/

function formatValidationError(
  error:
    z.ZodError
): string {
  return error.issues
    .map(
      (
        issue
      ) => {
        const path =
          issue.path.length >
          0
            ? issue.path.join(
                "."
              )
            : "arguments";


        return (
          `${path}: ` +
          issue.message
        );
      }
    )
    .join(
      "; "
    );
}


/*
==========================================
VALIDATE NATIVE TOOL CALL
==========================================
*/

export function validateNativeToolCall(
  toolName:
    string,

  rawArgs:
    unknown
): NativeToolValidationResult {
  const schema =
    toolSchemas[
      toolName as keyof
        typeof toolSchemas
    ];


  if (
    !schema
  ) {
    return {
      success:
        false,

      message:
        `Unknown native tool: ${toolName}`,
    };
  }


  /*
  Ollama normally gives us an object.

  This fallback also safely supports
  JSON-string arguments if needed.
  */

  let candidate:
    unknown =
    rawArgs;


  if (
    typeof candidate ===
    "string"
  ) {
    try {
      candidate =
        JSON.parse(
          candidate
        );
    } catch {
      return {
        success:
          false,

        message:
          "Tool arguments were not valid JSON.",
      };
    }
  }


  const result =
    schema.safeParse(
      candidate
    );


  if (
    !result.success
  ) {
    return {
      success:
        false,

      message:
        formatValidationError(
          result.error
        ),
    };
  }


  return {
    success:
      true,

    args:
      result.data as Record<
        string,
        unknown
      >,
  };
}