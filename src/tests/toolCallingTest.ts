import ollama from "ollama";

const MODEL = "qwen3:1.7b";

const tools = [
  {
    type: "function",
    function: {
      name: "create_folder",
      description:
        "Create a folder on the user's computer.",

      parameters: {
        type: "object",

        required: [
          "path",
        ],

        properties: {
          path: {
            type: "string",

            description:
              "Full Windows folder path, for example S:\\\\MyFolder",
          },
        },
      },
    },
  },
];

async function main() {
  console.log(
    "\n🧪 Testing native Ollama tool calling...\n"
  );

  const response =
    await ollama.chat({
      model: MODEL,

      messages: [
        {
          role: "system",

          content:
            "You are a local AI agent. Use tools when an actual computer action is required.",
        },

        {
          role: "user",

          content:
            "Create a folder called NativeToolTest in S drive.",
        },
      ],

      tools,

      stream: false,

      options: {
        temperature: 0.1,
      },
    });

  console.log(
    "MODEL RESPONSE:"
  );

  console.dir(
    response.message,
    {
      depth: null,
    }
  );

  if (
    response.message
      .tool_calls?.length
  ) {
    console.log(
      "\n✅ Native tool calling works!"
    );

    for (
      const toolCall
      of response.message.tool_calls
    ) {
      console.log(
        "\nTool:",
        toolCall.function.name
      );

      console.log(
        "Arguments:",
        toolCall.function.arguments
      );
    }
  } else {
    console.log(
      "\n❌ Model did not return a tool call."
    );

    console.log(
      "Content:",
      response.message.content
    );
  }
}

main().catch(
  console.error
);