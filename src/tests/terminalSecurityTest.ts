import {
  TerminalTool,
} from "../tools/TerminalTool.js";


async function main() {
  const terminal =
    new TerminalTool([
      process.cwd(),
      "S:\\",
    ]);


  console.log(
    "\n========== SAFE NODE VERSION =========="
  );

  console.log(
    await terminal.run(
      "node --version",
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK NODE INLINE CODE =========="
  );

  console.log(
    await terminal.run(
      `node -e "console.log('test')"`,
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK OTHER DRIVE =========="
  );

  console.log(
    await terminal.run(
      "node C:\\Windows\\test.js",
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK COMMAND CHAINING =========="
  );

  console.log(
    await terminal.run(
      "node --version && node --version",
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK UNKNOWN EXECUTABLE =========="
  );

  console.log(
    await terminal.run(
      "whoami",
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK POWERSHELL =========="
  );

  console.log(
    await terminal.run(
      "powershell Get-Date",
      "S:\\ai-agent-project"
    )
  );


  console.log(
    "\n========== BLOCK BAD CWD =========="
  );

  console.log(
    await terminal.run(
      "node --version",
      "C:\\Windows"
    )
  );
}


main().catch(
  console.error
);