import ollama, {
  type Message,
  type Tool,
} from "ollama";

const MODEL =
  process.env.OLLAMA_MODEL ||
  "qwen3:1.7b";

export async function askOllama(
  messages: Message[],
  tools: Tool[]
) {
  return await ollama.chat({
    model: MODEL,

    messages,

    tools,

    stream: false,

    think: true,

    options: {
      temperature: 0.1,
    },
  });
}