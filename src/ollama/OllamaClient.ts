
import ollama, {
  type Message,
  type Tool,
} from "ollama";

export type OllamaMode = "chat" | "agent";

/**
 * Lightweight customized model for conversations.
 * Larger model for complex tool-based tasks.
 */
const CHAT_MODEL =
  process.env.OLLAMA_CHAT_MODEL?.trim() ||
  "my-assistant";

const AGENT_MODEL =
  process.env.OLLAMA_AGENT_MODEL?.trim() ||
  "qwen3:8b";

export async function askOllama(
  messages: Message[],
  tools: Tool[],
  mode: OllamaMode = "agent"
) {
  const isChat = mode === "chat";

  const model = isChat
    ? CHAT_MODEL
    : AGENT_MODEL;

  const started = performance.now();

  console.log(
    `[Ollama] Starting ${mode} using ${model}`
  );

  try {
    const response = await ollama.chat({
      model,
      messages,

      ...(isChat ? {} : { tools }),

      stream: false,
      think: false,

      keep_alive: isChat ? "30m" : "10m",

      options: {
        temperature: isChat ? 0.5 : 0.1,
        top_p: 0.9,

        repeat_penalty: isChat ? 1.15 : 1.1,
        repeat_last_n: 128,

        num_ctx: 4096,
        num_predict: isChat ? 1536 : 512,
      },
    });

    const seconds = (
      (performance.now() - started) / 1000
    ).toFixed(2);

    console.log(
      `[Ollama] ${model} completed in ${seconds}s`
    );

    console.log(
      `[Ollama] Finish reason: ${
        response.done_reason ?? "unknown"
      }`
    );

    if (response.done_reason === "length") {
      console.warn(
        "[Ollama] Response reached the token limit."
      );
    }

    return response;
  } catch (error) {
    console.error(
      `[Ollama] Error using ${model}:`,
      error
    );

    throw error;
  }
}
