import ollama from "ollama";

const MODEL = "qwen3:1.7b";

export async function askOllama(
  prompt: string
): Promise<string> {
  try {
    const response =
      await ollama.chat({
        model: MODEL,

        messages: [
          {
            role: "system",

            content:
              "You are a local AI agent. Follow the user's tool instructions exactly. When asked for JSON, output only valid JSON.",
          },

          {
            role: "user",
            content: prompt,
          },
        ],

        format: "json",

        stream: false,

        options: {
          temperature: 0.1,
        },
      });

    return (
      response.message.content ??
      ""
    );
  } catch (error) {
    console.error(
      "❌ Ollama error:",
      error
    );

    throw error;
  }
}