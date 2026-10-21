/**
 * NEXA - model-provider contract.
 *
 * No dependency on Ollama, Google, Electron, or tool execution.
 * A concrete adapter (OllamaProvider, etc.) translates provider-specific
 * messages and exceptions into these types.
 */
/** Stable error contract for callers and unit tests. */
export class LLMProviderError extends Error {
    code;
    provider;
    cause;
    constructor(code, message, provider, cause) {
        super(message);
        this.name = "LLMProviderError";
        this.code = code;
        this.provider = provider;
        this.cause = cause;
    }
}
