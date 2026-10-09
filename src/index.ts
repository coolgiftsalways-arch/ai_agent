import {
  Agent,
} from "./agent/Agent.js";

import {
  askConsole,
  closeConsole,
} from "./utils/ConsoleIO.js";

async function main() {
  console.log(
    "\n🤖 LOCAL AI AGENT"
  );

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  console.log(
    "Agent started successfully."
  );

  console.log(
    "Type a task and press Enter."
  );

  console.log(
    'Type "exit" to stop.'
  );

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );

  const agent =
    new Agent();

  try {
    while (true) {
      const userInput =
        await askConsole(
          "\nYou: "
        );

      const command =
        userInput.trim();

      if (!command) {
        continue;
      }

      if (
        command.toLowerCase() ===
        "exit"
      ) {
        console.log(
          "\n👋 Agent stopped."
        );

        break;
      }

      try {
        const response =
          await agent.run(
            command
          );

        console.log(
          "\n🤖 Agent:"
        );

        console.log(
          response
        );
      } catch (error) {
        console.error(
          "\n❌ Agent error:"
        );

        console.error(
          error
        );
      }
    }
  } finally {
    closeConsole();
  }
}

main().catch(
  (error) => {
    console.error(
      "\n❌ Fatal error:"
    );

    console.error(
      error
    );

    closeConsole();
  }
);