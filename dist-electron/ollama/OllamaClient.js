import { OllamaProvider } from "../llm/OllamaProvider.js";
import { LLMProviderError, } from "../llm/LLMProvider.js";
const provider = new OllamaProvider();
function asToolArguments(value) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Reject invalid model output rather than forward it to Executor.
        }
    }
    throw new LLMProviderError("INVALID_RESPONSE", "A model tool call contained invalid JSON-object arguments.", provider.name);
}
function toProviderMessage(message) {
    if (message.role !== "system" &&
        message.role !== "user" &&
        message.role !== "assistant" &&
        message.role !== "tool") {
        throw new LLMProviderError("INVALID_RESPONSE", `Unsupported message role: ${String(message.role)}`, provider.name);
    }
    if (typeof message.content !== "string") {
        throw new LLMProviderError("INVALID_RESPONSE", "Only text messages are currently supported by the NEXA LLM interface.", provider.name);
    }
    // Do not silently discard multimodal inputs unsupported by LLMMessage.
    if ("images" in message && message.images != null) {
        if (!Array.isArray(message.images) || message.images.length > 0) {
            throw new LLMProviderError("INVALID_RESPONSE", "Image inputs require a multimodal extension to LLMProvider.", provider.name);
        }
    }
    return {
        role: message.role,
        content: message.content,
        ...(message.tool_name ? { toolName: message.tool_name } : {}),
        ...(message.tool_calls?.length
            ? {
                toolCalls: message.tool_calls.map((call) => ({
                    function: {
                        name: call.function.name,
                        arguments: call.function.arguments,
                    },
                })),
            }
            : {}),
    };
}
function toProviderTool(tool) {
    if (!tool.function?.name?.trim()) {
        throw new LLMProviderError("INVALID_RESPONSE", "Tool definition is missing its name.", provider.name);
    }
    return {
        type: "function",
        function: {
            name: tool.function.name,
            description: tool.function.description ?? "",
            parameters: (tool.function.parameters ?? {
                type: "object",
                properties: {},
            }),
        },
    };
}
function toNativeMessage(message) {
    return {
        role: message.role,
        content: message.content,
        ...(message.toolName ? { tool_name: message.toolName } : {}),
        ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                    function: {
                        name: call.function.name,
                        // Tool arguments remain untrusted and must still pass
                        // AgentToolRouter/PlanValidator and PermissionManager.
                        arguments: asToolArguments(call.function.arguments),
                    },
                })),
            }
            : {}),
    };
}
export async function askOllama(messages, tools, mode = "agent") {
    const started = performance.now();
    console.log(`[Ollama] Starting ${mode} via ${provider.name} provider`);
    try {
        const response = await provider.chat({
            mode,
            messages: messages.map(toProviderMessage),
            // Normal chat retains the existing no-tools behavior.
            ...(mode === "agent" && tools.length
                ? { tools: tools.map(toProviderTool) }
                : {}),
        });
        const nativeMessage = toNativeMessage(response.message);
        const seconds = ((performance.now() - started) / 1000).toFixed(2);
        console.log(`[Ollama] ${response.model} completed in ${seconds}s`);
        console.log(`[Ollama] Finish reason: ${response.finishReason ?? "unknown"}`);
        if (response.finishReason === "length") {
            console.warn("[Ollama] Response reached the token limit.");
        }
        return {
            model: response.model,
            message: nativeMessage,
            done_reason: response.finishReason,
            durationMs: response.durationMs,
        };
    }
    catch (error) {
        console.error(`[Ollama] Error during ${mode}:`, error);
        throw error;
    }
}
