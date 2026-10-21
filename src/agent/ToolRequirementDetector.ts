/**
 * NEXA — lightweight required-tool hints for the existing agent loop.
 *
 * These hints are NOT authorizations. The AI selects actual tool calls;
 * validation, Executor, and PermissionManager enforce execution rules.
 *
 * A mention of an action in a prohibition is not permission to perform it.
 */
export type ToolRequirement = {
  toolNames: string[];
  description: string;
};

const EMAIL_ADDRESS_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function isCapabilityQuestion(userInput: string): boolean {
  const text = userInput.trim();
  return (
    /^(can|could|would)\s+you\b/i.test(text) ||
    /^are\s+you\s+able\s+to\b/i.test(text) ||
    /^do\s+you\s+support\b/i.test(text) ||
    /^is\s+it\s+possible\b/i.test(text) ||
    /^can\s+this\s+agent\b/i.test(text)
  );
}

/**
 * A safety check, not a natural-language command router.
 *
 * A phrase such as "do not send" or "without sending" must never
 * become gmail_send merely because the words "send" and "email" occur.
 * For mixed/contradictory instructions we err on the side of NOT sending.
 */
function forbidsSending(text: string): boolean {
  return (
    /\b(?:do\s+not|don't|dont|never|without|avoid|must\s+not|should\s+not|not\s+to|cannot|can't)\s+(?:(?:\w+|,)\s+){0,5}(?:send|email)\b/i.test(text) ||
    /\b(?:do\s+not|don't|dont|never|without|avoid|must\s+not|should\s+not|not\s+to|cannot|can't)\s+send(?:ing)?\b/i.test(text) ||
    /\b(?:don't|do\s+not|never)\s+(?:actually\s+)?send\s+(?:it|them|anything)\b/i.test(text)
  );
}

/**
 * Retain the previous positive send detection, but only after the
 * no-send safety check. Explicit confirmations for real sending
 * remain the responsibility of PermissionManager.
 */
function hasGmailSendIntent(text: string): boolean {
  if (forbidsSending(text)) return false;

  const hasMailContext =
    /\b(email|emails|gmail|mail)\b/i.test(text) ||
    EMAIL_ADDRESS_REGEX.test(text);

  const draftOrReview =
    /\b(draft|write|compose|rewrite|improve|review|proofread)\b/i.test(text);

  const explicitSend = /\bsend\b/i.test(text);

  // A draft request alone should not initiate a send.
  if (draftOrReview && !explicitSend) return false;

  return (
    (explicitSend && hasMailContext) ||
    /^\s*(?:please\s+)?email\s+(?:to\s+)?[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)
  );
}

export function detectToolRequirement(
  userInput: string
): ToolRequirement | null {
  const text = userInput.trim().toLowerCase();
  if (!text) return null;

  const containsFileExtension = /\.[a-z0-9]{1,10}\b/i.test(text);

  // Capability questions must never start a real action.
  if (isCapabilityQuestion(userInput)) return null;

  // Gmail send is checked before Gmail read/search only if it is
  // affirmative. A negated send falls through to the read-only tools.
  if (hasGmailSendIntent(text)) {
    return { toolNames: ["gmail_send"], description: "gmail_send" };
  }

  // Gmail: read a specific message by ID.
  if (
    /\b(read|open)\b/i.test(text) &&
    /\b(email|gmail|mail|message)\b/i.test(text) &&
    /\b(id|message id)\b/i.test(text)
  ) {
    return { toolNames: ["gmail_read"], description: "gmail_read" };
  }

  // Gmail: search.
  if (
    /\b(email|emails|gmail|mail)\b/i.test(text) &&
    /\b(search|find|from|about|containing|subject)\b/i.test(text)
  ) {
    return { toolNames: ["gmail_search"], description: "gmail_search" };
  }

  // Gmail: latest/inbox read-only retrieval.
  if (
    /\b(email|emails|gmail|mail|inbox)\b/i.test(text) &&
    /\b(latest|recent|newest|last|inbox|show|read)\b/i.test(text)
  ) {
    return { toolNames: ["gmail_recent"], description: "gmail_recent" };
  }

  // Memory: forget.
  if (/\bforget\b/i.test(text) && /\bmemory\b/i.test(text)) {
    if (
      /\bmemory\s+(?:id\s*)?\d+\b/i.test(text) ||
      /\bid\s*\d+\b/i.test(text)
    ) {
      return { toolNames: ["memory_forget"], description: "memory_forget" };
    }
    return {
      toolNames: ["memory_search", "memory_forget"],
      description: "memory search followed by memory forget",
    };
  }

  if (/\bremember\b/i.test(text)) {
    return { toolNames: ["memory_remember"], description: "memory_remember" };
  }

  if (
    (/\bsearch\b/i.test(text) && /\bmemory\b/i.test(text)) ||
    /\bmemory id\b/i.test(text)
  ) {
    return { toolNames: ["memory_search"], description: "memory_search" };
  }

  // Existing file-management hints, preserved in their original order.
  if (/\brename\b/i.test(text)) {
    return { toolNames: ["file_rename", "file_move"], description: "file rename" };
  }

  if (
    /\bmove\b/i.test(text) &&
    (text.includes("\\") || /\b(file|folder|directory)\b/i.test(text))
  ) {
    return { toolNames: ["file_move", "file_rename"], description: "file move" };
  }

  if (
    /\b(delete|remove)\b/i.test(text) &&
    (text.includes("\\") || /\b(file|folder|directory)\b/i.test(text))
  ) {
    return {
      toolNames: ["file_delete_file", "file_delete_folder"],
      description: "file or folder deletion",
    };
  }

  if (
    /\bcontent(?:s)?\s+to\b/i.test(text) ||
    (/\b(change|update|edit|replace|overwrite)\b/i.test(text) &&
      /\b(content|contents|file)\b/i.test(text))
  ) {
    return { toolNames: ["file_write_file"], description: "file_write_file" };
  }

  if (
    /\b(create|make)\b/i.test(text) &&
    /\b(folder|directory)\b/i.test(text)
  ) {
    return { toolNames: ["file_create_folder"], description: "file_create_folder" };
  }

  if (
    /\b(create|make)\b/i.test(text) &&
    (/\bfile\b/i.test(text) || containsFileExtension)
  ) {
    return { toolNames: ["file_create_file"], description: "file_create_file" };
  }

  if (
    /\b(exists|exist|present)\b/i.test(text) &&
    (text.includes("\\") || /\b(file|folder|directory|path)\b/i.test(text))
  ) {
    return { toolNames: ["file_exists"], description: "file_exists" };
  }

  if (
    (/\bread\b/i.test(text) || /\bexact content\b/i.test(text) ||
      /\bfile content\b/i.test(text)) &&
    (containsFileExtension || text.includes("\\"))
  ) {
    return { toolNames: ["file_read_file"], description: "file_read_file" };
  }

  if (
    (/\blist\b/i.test(text) || /\bcontents?\b/i.test(text) ||
      /\bwhat(?:'s| is)? inside\b/i.test(text) ||
      /\btell me[\s\S]*inside\b/i.test(text)) &&
    !containsFileExtension
  ) {
    return { toolNames: ["file_list_files"], description: "file_list_files" };
  }

  if (
    /\b(run|execute)\b/i.test(text) &&
    /\b(npm|npx|node|git|pnpm|yarn|powershell|cmd|tsc)\b/i.test(text)
  ) {
    return { toolNames: ["terminal_run"], description: "terminal_run" };
  }

  return null;
}
