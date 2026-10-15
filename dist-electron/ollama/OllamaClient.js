import ollama from "ollama";
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ||
    "qwen3:1.7b";
const AGENT_MODEL = process.env.OLLAMA_AGENT_MODEL ||
    "qwen3:8b";
export async function askOllama(messages, tools, mode = "agent") {
    const isChat = mode === "chat";
    const model = isChat
        ? CHAT_MODEL
        : AGENT_MODEL;
    return await ollama.chat({
        model,
        messages,
        /*
        Simple conversation does not need
        all tool definitions.
    
        Real tasks still get the full tools.
        */
        ...(isChat
            ? {}
            : {
                tools,
            }),
        stream: false,
        think: false,
        /*
        Small chat model stays loaded longer.
    
        8B is larger, so don't keep it loaded
        forever when it isn't being used.
        */
        keep_alive: isChat
            ? "30m"
            : "10m",
        options: {
            temperature: isChat
                ? 0.2
                : 0.1,
            /*
            Simple chat needs much less context.
            */
            num_ctx: isChat
                ? 2048
                : 4096,
            /*
            Shorter generation for normal chat.
            */
            num_predict: isChat
                ? 128
                : 256,
        },
    });
}
