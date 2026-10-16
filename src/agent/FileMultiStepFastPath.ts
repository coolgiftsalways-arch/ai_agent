
import path from "node:path";

/**
 * NEXA Multi-Step File Fast Path
 *
 * Recognizes:
 * Create a folder named demo in S drive and
 * create a file named hello.txt inside it containing hii.
 *
 * This file ONLY parses instructions.
 * It never creates, reads, or modifies files.
 *
 * Agent.ts must execute all actions through:
 * Validator -> Executor -> PermissionManager -> FileTool
 */

export type FilePlan = {
  folderPath: string;
  filePath: string;
  content: string;
};

export type FilePlanResolution =
  | { status: "matched"; plan: FilePlan }
  | { status: "clarify"; message: string }
  | { status: "unmatched" };

const INVALID_NAME = /[\\/:*?"<>|\x00-\x1f]/;

const RESERVED_NAME =
  /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

function validName(name: string): boolean {
  return Boolean(
    name &&
    name.length <= 100 &&
    name !== "." &&
    name !== ".." &&
    !INVALID_NAME.test(name) &&
    !/[. ]$/.test(name) &&
    !RESERVED_NAME.test(name)
  );
}

function parseParent(raw: string): string | null {
  const target = raw.trim();

  // Explicit S drive aliases.
  if (/^(?:s\s+drive|s:|s:\\)$/i.test(target)) {
    return "S:\\";
  }

  // Current project aliases.
  if (
    /^(?:my\s+project|the\s+project|current\s+project|ai[\s_-]*agent[\s_-]*project)$/i.test(
      target
    )
  ) {
    const cwd = process.cwd();

    return /^[a-z]:[\\/]/i.test(cwd)
      ? path.win32.normalize(cwd)
      : null;
  }

  // Absolute drive paths only.
  if (
    !/^[a-z]:[\\/]/i.test(target) ||
    /[\x00-\x1f"<>|?*]/.test(target) ||
    target.slice(2).includes(":")
  ) {
    return null;
  }

  // Do not allow directory traversal.
  if (
    target
      .slice(3)
      .split(/[\\/]/)
      .some((piece) => piece === "..")
  ) {
    return null;
  }

  return path.win32.normalize(target);
}

export function resolveMultiStepFileCommand(
  input: string
): FilePlanResolution {
  const text = input.trim().replace(/[.!?]+$/, "");

  if (
    !text ||
    text.length > 700 ||
    /[\r\n]/.test(text)
  ) {
    return { status: "unmatched" };
  }

  // Do not shortcut destructive or complex tasks.
  if (
    /\b(delete|remove|erase|rename|move|copy|overwrite|modify|edit|upload|download|send|execute|run|afterwards|recursive|recursively)\b/i.test(
      text
    )
  ) {
    return { status: "unmatched" };
  }

  /**
   * Recognized example:
   *
   * Create a folder named demo in S drive
   * and create a file named hello.txt
   * inside it containing hii
   */
  const match =
    /^(?:please\s+)?(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory)\s+(?:named|called|names)\s+(.+?)\s+(?:inside|in|under|on)\s+(.+?)\s+and\s+(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:text\s+)?file\b(.*)$/i.exec(
      text
    );

  if (!match) {
    return { status: "unmatched" };
  }

  const folderName = match[1].trim();
  const parent = parseParent(match[2]);

  if (!validName(folderName) || !parent) {
    return {
      status: "clarify",
      message:
        "Please provide a valid folder name and an explicit destination, such as S drive or S:\\Projects. Nothing was created.",
    };
  }

  const folderPath = path.win32.join(
    parent,
    folderName
  );

  const tail = match[3].trim();

  // Filename must be explicitly provided.
  const explicit =
    /^(?:named|called)\s+(.+?)\s+(?:inside|in)\s+(?:of\s+)?(?:it|that\s+folder|the\s+folder)\s+(?:containing|with\s+(?:the\s+)?(?:content|text)|saying)\s+([\s\S]+)$/i.exec(
      tail
    ) ??
    /^(?:inside|in)\s+(?:of\s+)?(?:it|that\s+folder|the\s+folder)\s+(?:named|called)\s+(.+?)\s+(?:containing|with\s+(?:the\s+)?(?:content|text)|saying)\s+([\s\S]+)$/i.exec(
      tail
    );

  if (!explicit) {
    return {
      status: "clarify",
      message:
        `What filename should I use inside ${folderPath}?\n\n` +
        `For example:\n` +
        `Create a folder named ${folderName} in ${match[2].trim()} ` +
        `and create a file named hello.txt inside it containing hii.\n\n` +
        "Nothing was created.",
    };
  }

  const fileName = explicit[1].trim();

  let content = explicit[2].trim();

  // Remove matching quotes around content.
  if (
    (content.startsWith('"') &&
      content.endsWith('"')) ||
    (content.startsWith("'") &&
      content.endsWith("'"))
  ) {
    content = content.slice(1, -1);
  }

  if (
    !validName(fileName) ||
    !/\.[a-z0-9]{1,12}$/i.test(fileName) ||
    !content ||
    content.length > 10000
  ) {
    return {
      status: "clarify",
      message:
        "Please provide a valid filename with an extension, such as hello.txt, and text content up to 10,000 characters. Nothing was created.",
    };
  }

  const filePath = path.win32.join(
    folderPath,
    fileName
  );

  return {
    status: "matched",
    plan: {
      folderPath,
      filePath,
      content,
    },
  };
}
