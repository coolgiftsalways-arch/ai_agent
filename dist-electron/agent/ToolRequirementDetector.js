const EMAIL_ADDRESS_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/*
==========================================
CAPABILITY QUESTION
==========================================

Examples:

Can you send emails?
Can you send email to 2 people?
Are you able to send Gmail?
Do you support multiple recipients?

These are QUESTIONS about capability.

They must NOT start a real action.
==========================================
*/
function isCapabilityQuestion(userInput) {
    const text = userInput.trim();
    return (/^(can|could|would)\s+you\b/i.test(text) ||
        /^are\s+you\s+able\s+to\b/i.test(text) ||
        /^do\s+you\s+support\b/i.test(text) ||
        /^is\s+it\s+possible\b/i.test(text) ||
        /^can\s+this\s+agent\b/i.test(text));
}
/*
==========================================
DETECT TOOL REQUIREMENT
==========================================
*/
export function detectToolRequirement(userInput) {
    const text = userInput
        .trim()
        .toLowerCase();
    const containsFileExtension = /\.[a-z0-9]{1,10}\b/i.test(text);
    /*
    ==========================================
    CAPABILITY QUESTIONS
  
    Never execute tools for:
  
    "Can you...?"
    "Are you able...?"
    "Do you support...?"
    ==========================================
    */
    if (isCapabilityQuestion(userInput)) {
        return null;
    }
    /*
    ==========================================
    GMAIL SEND
    ==========================================
    */
    const hasEmailAddress = EMAIL_ADDRESS_REGEX.test(text);
    /*
    Draft/write/compose means the user wants
    text created, NOT actually sent.
  
    Unless they explicitly also say "send".
    */
    const draftOnly = /\b(draft|write|compose|rewrite|improve|review|proofread)\b/i.test(text) &&
        !/\bsend\b/i.test(text);
    if (!draftOnly &&
        (
        /*
        Explicit send instruction.
        */
        (/\bsend\b/i.test(text) &&
            (/\b(email|emails|gmail|mail)\b/i.test(text) ||
                hasEmailAddress)) ||
            /*
            Imperative:
      
            Email person@example.com
            */
            /^\s*email\s+(?:to\s+)?[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(userInput))) {
        return {
            toolNames: [
                "gmail_send",
            ],
            description: "gmail_send",
        };
    }
    /*
    ==========================================
    GMAIL READ ONE MESSAGE
  
    Keep this before Gmail recent.
    ==========================================
    */
    if (/\b(read|open)\b/i.test(text) &&
        /\b(email|gmail|mail|message)\b/i.test(text) &&
        /\b(id|message id)\b/i.test(text)) {
        return {
            toolNames: [
                "gmail_read",
            ],
            description: "gmail_read",
        };
    }
    /*
    ==========================================
    GMAIL SEARCH
    ==========================================
    */
    if (/\b(email|emails|gmail|mail)\b/i.test(text) &&
        /\b(search|find|from|about|containing|subject)\b/i.test(text)) {
        return {
            toolNames: [
                "gmail_search",
            ],
            description: "gmail_search",
        };
    }
    /*
    ==========================================
    GMAIL RECENT
    ==========================================
    */
    if (/\b(email|emails|gmail|mail|inbox)\b/i.test(text) &&
        /\b(latest|recent|newest|last|inbox|show|read)\b/i.test(text)) {
        return {
            toolNames: [
                "gmail_recent",
            ],
            description: "gmail_recent",
        };
    }
    /*
    ==========================================
    MEMORY FORGET
    ==========================================
    */
    if (/\bforget\b/i.test(text) &&
        /\bmemory\b/i.test(text)) {
        /*
        Specific memory ID supplied.
        */
        if (/\bmemory\s+(?:id\s*)?\d+\b/i.test(text) ||
            /\bid\s*\d+\b/i.test(text)) {
            return {
                toolNames: [
                    "memory_forget",
                ],
                description: "memory_forget",
            };
        }
        /*
        Need to search before forgetting.
        */
        return {
            toolNames: [
                "memory_search",
                "memory_forget",
            ],
            description: "memory search followed by memory forget",
        };
    }
    /*
    ==========================================
    MEMORY REMEMBER
    ==========================================
    */
    if (/\bremember\b/i.test(text)) {
        return {
            toolNames: [
                "memory_remember",
            ],
            description: "memory_remember",
        };
    }
    /*
    ==========================================
    MEMORY SEARCH
    ==========================================
    */
    if ((/\bsearch\b/i.test(text) &&
        /\bmemory\b/i.test(text)) ||
        /\bmemory id\b/i.test(text)) {
        return {
            toolNames: [
                "memory_search",
            ],
            description: "memory_search",
        };
    }
    /*
    ==========================================
    FILE RENAME
    ==========================================
    */
    if (/\brename\b/i.test(text)) {
        return {
            toolNames: [
                "file_rename",
                "file_move",
            ],
            description: "file rename",
        };
    }
    /*
    ==========================================
    FILE MOVE
    ==========================================
    */
    if (/\bmove\b/i.test(text) &&
        (text.includes("\\") ||
            /\b(file|folder|directory)\b/i.test(text))) {
        return {
            toolNames: [
                "file_move",
                "file_rename",
            ],
            description: "file move",
        };
    }
    /*
    ==========================================
    FILE DELETE
    ==========================================
    */
    if (/\b(delete|remove)\b/i.test(text) &&
        (text.includes("\\") ||
            /\b(file|folder|directory)\b/i.test(text))) {
        return {
            toolNames: [
                "file_delete_file",
                "file_delete_folder",
            ],
            description: "file or folder deletion",
        };
    }
    /*
    ==========================================
    WRITE FILE
    ==========================================
    */
    if (/\bcontent(?:s)?\s+to\b/i.test(text) ||
        (/\b(change|update|edit|replace|overwrite)\b/i.test(text) &&
            /\b(content|contents|file)\b/i.test(text))) {
        return {
            toolNames: [
                "file_write_file",
            ],
            description: "file_write_file",
        };
    }
    /*
    ==========================================
    CREATE FOLDER
    ==========================================
    */
    if (/\b(create|make)\b/i.test(text) &&
        /\b(folder|directory)\b/i.test(text)) {
        return {
            toolNames: [
                "file_create_folder",
            ],
            description: "file_create_folder",
        };
    }
    /*
    ==========================================
    CREATE FILE
    ==========================================
    */
    if (/\b(create|make)\b/i.test(text) &&
        (/\bfile\b/i.test(text) ||
            containsFileExtension)) {
        return {
            toolNames: [
                "file_create_file",
            ],
            description: "file_create_file",
        };
    }
    /*
    ==========================================
    FILE EXISTS
    ==========================================
    */
    if (/\b(exists|exist|present)\b/i.test(text) &&
        (text.includes("\\") ||
            /\b(file|folder|directory|path)\b/i.test(text))) {
        return {
            toolNames: [
                "file_exists",
            ],
            description: "file_exists",
        };
    }
    /*
    ==========================================
    READ FILE
    ==========================================
    */
    if ((/\bread\b/i.test(text) ||
        /\bexact content\b/i.test(text) ||
        /\bfile content\b/i.test(text)) &&
        (containsFileExtension ||
            text.includes("\\"))) {
        return {
            toolNames: [
                "file_read_file",
            ],
            description: "file_read_file",
        };
    }
    /*
    ==========================================
    LIST DIRECTORY
    ==========================================
    */
    if ((/\blist\b/i.test(text) ||
        /\bcontents?\b/i.test(text) ||
        /\bwhat(?:'s| is)? inside\b/i.test(text) ||
        /\btell me[\s\S]*inside\b/i.test(text)) &&
        !containsFileExtension) {
        return {
            toolNames: [
                "file_list_files",
            ],
            description: "file_list_files",
        };
    }
    /*
    ==========================================
    TERMINAL
    ==========================================
    */
    if (/\b(run|execute)\b/i.test(text) &&
        /\b(npm|npx|node|git|pnpm|yarn|powershell|cmd|tsc)\b/i.test(text)) {
        return {
            toolNames: [
                "terminal_run",
            ],
            description: "terminal_run",
        };
    }
    return null;
}
