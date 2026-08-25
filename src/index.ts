import { Agent } from "./agent/Agent.js";

async function main() {
  console.log("🤖 AI Agent starting...\n");

  const agent = new Agent();

  const result = await agent.run(`
Create a file called agent-test.txt containing:

AI Agent is working.

Then run npm run build to verify that the project still builds successfully.
`);

  console.log("\n==============================");
  console.log("🤖 FINAL AGENT RESPONSE");
  console.log("==============================\n");

  console.log(result);
}

main().catch((error) => {
  console.error("❌ Agent error:", error);
  process.exit(1);
});