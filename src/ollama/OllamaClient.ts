import ollama from "ollama";

const MODEL = "qwen3:1.7b";

export async function askOllama(prompt: string): Promise<string> {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    stream: false,
  });

  return response.message.content;
}