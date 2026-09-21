import { Agent } from "./agent/Agent.js";

async function main() {
  console.log("🤖 AI Agent starting...\n");

  const agent = new Agent();

  const result = await agent.run(
    "Run npm run build and tell me whether the project builds successfully."
  );

  console.log("\n==============================");
  console.log("🤖 FINAL AGENT RESPONSE");
  console.log("==============================\n");

  console.log(result);
}

main().catch((error) => {
  console.error("❌ Agent error:", error);
  process.exit(1);
});