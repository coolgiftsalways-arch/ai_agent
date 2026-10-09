import readline from "readline/promises";

import {
  stdin as input,
  stdout as output,
} from "process";

const rl =
  readline.createInterface({
    input,
    output,
  });

export async function askConsole(
  message: string
): Promise<string> {
  return await rl.question(
    message
  );
}

export function closeConsole(): void {
  rl.close();
}