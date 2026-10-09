import {
  askConsole,
} from "../utils/ConsoleIO.js";

export async function askForApproval(
  message: string
): Promise<boolean> {
  console.log("\n");
  console.log("⚠️ AGENT PERMISSION");
  console.log("-------------------");
  console.log(message);

  const answer =
    await askConsole(
      "\nAllow? (y/n): "
    );

  const cleaned =
    answer
      .trim()
      .toLowerCase();

  return (
    cleaned === "y" ||
    cleaned === "yes"
  );
}