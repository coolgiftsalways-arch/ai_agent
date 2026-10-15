import type { Tool } from "ollama";

import {
  agentTools,
  mapNativeToolCall,
} from "./NativeToolDefinitions.js";

import {
  browserTools,
  mapBrowserToolCall,
} from "./BrowserToolDefinitions.js";

import {
  validateNativeToolCall,
} from "../security/NativeToolValidator.js";

import {
  validateBrowserToolCall,
} from "../security/BrowserToolValidator.js";


/*
==========================================
ALL AGENT TOOLS
==========================================
*/

export const allAgentTools: Tool[] = [
  ...agentTools,
  ...browserTools,
];


/*
==========================================
VALIDATE TOOL CALL
==========================================
*/

export function validateAgentToolCall(
  toolName: string,
  rawArgs: unknown
) {
  if (
    toolName.startsWith(
      "browser_"
    )
  ) {
    return validateBrowserToolCall(
      toolName,
      rawArgs
    );
  }

  return validateNativeToolCall(
    toolName,
    rawArgs
  );
}


/*
==========================================
MAP TOOL CALL
==========================================
*/

export function mapAgentToolCall(
  toolName: string,
  args: Record<string, unknown>
) {
  if (
    toolName.startsWith(
      "browser_"
    )
  ) {
    return mapBrowserToolCall(
      toolName,
      args
    );
  }

  return mapNativeToolCall(
    toolName,
    args
  );
}
