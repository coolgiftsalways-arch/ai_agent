import readline from "readline/promises";

import {
  stdin as input,
  stdout as output,
} from "process";

import { Agent } from "./agent/Agent.js";

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

  const rl =
    readline.createInterface({
      input,
      output,
    });

  while (true) {
    const userInput =
      await rl.question(
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

      console.log(response);
    } catch (error) {
      console.error(
        "\n❌ Agent error:"
      );

      console.error(error);
    }
  }

  rl.close();
}

main().catch(
  console.error
);