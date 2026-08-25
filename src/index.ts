import { Agent } from "./agent/Agent.js";

async function main() {
  console.log("🤖 AI Agent starting...\n");

  const agent = new Agent();

  const result = await agent.run(
    "Create a file called hello.txt containing Hello World"
  );

  console.log("\nAgent:");
  console.log(result);
}

main().catch((error) => {
  console.error("❌ Agent error:", error);
  process.exit(1);
});