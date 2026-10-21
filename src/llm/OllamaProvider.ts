import { Ollama, type Message, type Tool } from "ollama";

import {
  LLMProviderError,
  type LLMGenerationOptions,
  type LLMMessage,
  type LLMMode,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./LLMProvider.js";

/**
 * Ollama adapter for NEXA's provider-independent LLM contract.
 *
 * This module DOES NOT execute tool calls, access files, send emails,
 * or grant permissions. It only sends model requests and validates the
 * transport-level response.
 */

export interface OllamaProviderConfig {
  host?: string;
  models?: Partial<Record<LLMMode, string>>;
  /** Default request timeout; can be overridden per request. */
  timeoutMs?: number;
  /** Injectable HTTP transport for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TIMEOUT_MS = 600_000;

function configuredTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value < 1_000 || value > MAX_TIMEOUT_MS) {
    throw new LLMProviderError(
      "INVALID_RESPONSE",
      `LLM timeout must be between 1000 and ${MAX_TIMEOUT_MS} milliseconds.`,
      "ollama"
    );
  }
  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Invalid arguments are rejected, never executed.
    }
  }
  throw new LLMProviderError(
    "INVALID_RESPONSE",
    "A tool call contains arguments that are not a JSON object.",
    "ollama"
  );
}

function toOllamaMessage(message: LLMMessage): Message {
  if (typeof message.content !== "string") {
    throw new LLMProviderError("INVALID_RESPONSE", "Message content must be text.", "ollama");
  }

  return {
    role: message.role,
    content: message.content,
    ...(message.toolName ? { tool_name: message.toolName } : {}),
    ...(message.toolCalls?.length
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            function: {
              name: call.function.name,
              arguments: normalizeToolArguments(call.function.arguments),
            },
          })),
        }
      : {}),
  };
}

function fromOllamaMessage(value: unknown): LLMMessage {
  if (!isRecord(value) || typeof value.role !== "string") {
    throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned an invalid message.", "ollama");
  }
  if (!["assistant", "system", "user", "tool"].includes(value.role)) {
    throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned an unknown message role.", "ollama");
  }
  if (typeof value.content !== "string") {
    throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned invalid message content.", "ollama");
  }

  const calls = value.tool_calls;
  if (calls !== undefined && !Array.isArray(calls)) {
    throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned invalid tool calls.", "ollama");
  }

  const toolCalls = (calls as unknown[] | undefined)?.map((call) => {
    if (!isRecord(call) || !isRecord(call.function) ||
        typeof call.function.name !== "string" || !call.function.name.trim()) {
      throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned a tool call without a name.", "ollama");
    }
    return {
      ...(typeof call.id === "string" ? { id: call.id } : {}),
      function: {
        name: call.function.name,
        // Keep proposals untrusted. PlanValidator performs action/schema checks.
        arguments: call.function.arguments,
      },
    };
  });

  return {
    role: value.role as LLMMessage["role"],
    content: value.content,
    ...(typeof value.tool_name === "string" ? { toolName: value.tool_name } : {}),
    ...(toolCalls?.length ? { toolCalls } : {}),
  };
}

function mapError(error: unknown, timedOut: boolean): LLMProviderError {
  if (error instanceof LLMProviderError) return error;
  const record = isRecord(error) ? error : {};
  const message = error instanceof Error ? error.message : String(error);
  const status = record.status_code ?? record.status;

  if (timedOut) {
    return new LLMProviderError("TIMEOUT", "Ollama did not respond before the configured timeout.", "ollama", error);
  }
  if (status === 404 || /model\s+['"`]?.+?['"`]?\s+(?:not found|does not exist)/i.test(message)) {
    return new LLMProviderError("MODEL_NOT_FOUND", message, "ollama", error);
  }
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|fetch failed|connection refused/i.test(message)) {
    return new LLMProviderError("CONNECTION_FAILED", "Cannot connect to the Ollama server.", "ollama", error);
  }
  return new LLMProviderError("PROVIDER_FAILURE", message, "ollama", error);
}

function defaultsFor(mode: LLMMode): Required<Pick<LLMGenerationOptions,
  "temperature" | "topP" | "repeatPenalty" | "repeatLastN" |
  "contextWindow" | "maxOutputTokens" | "keepAlive" | "think">> {
  switch (mode) {
    case "chat":
      return { temperature: 0.5, topP: 0.9, repeatPenalty: 1.15,
        repeatLastN: 128, contextWindow: 4096, maxOutputTokens: 1536,
        keepAlive: "30m", think: false };
    case "planner":
      return { temperature: 0, topP: 0.9, repeatPenalty: 1.1,
        repeatLastN: 128, contextWindow: 8192, maxOutputTokens: 768,
        keepAlive: "20m", think: false };
    case "summary":
      return { temperature: 0.2, topP: 0.9, repeatPenalty: 1.1,
        repeatLastN: 128, contextWindow: 8192, maxOutputTokens: 1536,
        keepAlive: "10m", think: false };
    case "agent":
      return { temperature: 0.1, topP: 0.9, repeatPenalty: 1.1,
        repeatLastN: 128, contextWindow: 4096, maxOutputTokens: 512,
        keepAlive: "10m", think: false };
  }
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private readonly host: string;
  private readonly models: Record<LLMMode, string>;
  private readonly timeoutMs: number;
  private readonly transportFetch: typeof fetch;

  constructor(config: OllamaProviderConfig = {}) {
    this.host = config.host?.trim() || process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
    this.timeoutMs = configuredTimeout(config.timeoutMs);
    this.transportFetch = config.fetch ?? fetch;
    const agentModel = process.env.OLLAMA_AGENT_MODEL?.trim() || "qwen3:8b";
    this.models = {
      chat: process.env.OLLAMA_CHAT_MODEL?.trim() || "my-assistant",
      agent: agentModel,
      planner: process.env.OLLAMA_PLANNER_MODEL?.trim() || agentModel,
      summary: process.env.OLLAMA_SUMMARY_MODEL?.trim() || agentModel,
      ...config.models,
    };
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model?.trim() || this.models[request.mode];
    if (!model || !request.messages.length) {
      throw new LLMProviderError("INVALID_RESPONSE", "A model and at least one message are required.", this.name);
    }
    const opts = { ...defaultsFor(request.mode), ...request.options };
    const timeoutMs = configuredTimeout(request.options?.timeoutMs ?? this.timeoutMs);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const client = new Ollama({
      host: this.host,
      // Dedicated client + abort signal means one request's timeout cannot
      // interrupt a different request (including concurrent Gmail summaries).
      fetch: (input, init) => this.transportFetch(input, {
        ...init,
        signal: controller.signal,
      }),
    });

    const started = performance.now();
    try {
      const tools: Tool[] = (request.tools ?? []).map((tool) => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description ?? "",
          parameters: tool.function.parameters as Tool["function"]["parameters"],
        },
      }));

      const response = await client.chat({
        model,
        messages: request.messages.map(toOllamaMessage),
        ...(tools.length ? { tools } : {}),
        ...(opts.responseFormat === "json" ? { format: "json" } : {}),
        stream: false,
        think: opts.think,
        keep_alive: opts.keepAlive,
        options: {
          temperature: opts.temperature,
          top_p: opts.topP,
          repeat_penalty: opts.repeatPenalty,
          repeat_last_n: opts.repeatLastN,
          num_ctx: opts.contextWindow,
          num_predict: opts.maxOutputTokens,
        },
      });

      if (!response || typeof response.model !== "string") {
        throw new LLMProviderError("INVALID_RESPONSE", "Ollama returned an invalid response.", this.name);
      }
      return {
        model: response.model,
        message: fromOllamaMessage(response.message),
        ...(typeof response.done_reason === "string" ? { finishReason: response.done_reason } : {}),
        durationMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      throw mapError(error, timedOut);
    } finally {
      clearTimeout(timer);
    }
  }
}
