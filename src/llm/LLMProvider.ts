
/**
 * NEXA - model-provider contract.
 *
 * No dependency on Ollama, Google, Electron, or tool execution.
 * A concrete adapter (OllamaProvider, etc.) translates provider-specific
 * messages and exceptions into these types.
 */

export type LLMMode = "chat" | "agent" | "planner" | "summary";

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMFunctionCall {
  name: string;
  /** Untrusted model output; validate before treating it as tool arguments. */
  arguments: unknown;
}

export interface LLMToolCall {
  id?: string;
  function: LLMFunctionCall;
}

export interface LLMMessage {
  role: LLMRole;
  content: string;
  /** Name of the tool that produced a role="tool" message. */
  toolName?: string;
  /** Proposed calls, NOT permission to execute tools. */
  toolCalls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    /** Provider-independent JSON Schema object. */
    parameters: Record<string, unknown>;
  };
}

export interface LLMGenerationOptions {
  temperature?: number;
  topP?: number;
  repeatPenalty?: number;
  repeatLastN?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  keepAlive?: string;
  timeoutMs?: number;
  think?: boolean;
  responseFormat?: "text" | "json";
}

export interface LLMRequest {
  mode: LLMMode;
  messages: readonly LLMMessage[];
  tools?: readonly LLMToolDefinition[];
  /** Overrides the provider's default model for this request. */
  model?: string;
  options?: LLMGenerationOptions;
}

export interface LLMResponse {
  model: string;
  message: LLMMessage;
  finishReason?: string;
  durationMs?: number;
}

export type LLMErrorCode =
  | "CONNECTION_FAILED"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "PROVIDER_FAILURE";

/** Stable error contract for callers and unit tests. */
export class LLMProviderError extends Error {
  readonly code: LLMErrorCode;
  readonly provider: string;
  readonly cause?: unknown;

  constructor(
    code: LLMErrorCode,
    message: string,
    provider: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "LLMProviderError";
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

/**
 * Implementations must never execute a proposed tool call. The planner and
 * validator decide whether to accept a proposal; Executor and
 * PermissionManager decide whether an accepted action may be executed.
 */
export interface LLMProvider {
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
}
