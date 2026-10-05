import readline from "readline/promises";

import {
  stdin as input,
  stdout as output,
} from "process";

export async function askForApproval(
  message: string
): Promise<boolean> {
  const rl =
    readline.createInterface({
      input,
      output,
    });

  console.log("\n");
  console.log("⚠️ AGENT PERMISSION");
  console.log("-------------------");
  console.log(message);

  const answer =
    await rl.question(
      "\nAllow? (y/n): "
    );

  rl.close();

  return (
    answer.trim().toLowerCase() ===
      "y" ||
    answer.trim().toLowerCase() ===
      "yes"
  );
}