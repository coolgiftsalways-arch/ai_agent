import {
  validateNativeToolCall,
} from "../security/NativeToolValidator.js";


function test(
  name: string,
  toolName: string,
  args: unknown
) {
  console.log(
    `\n========== ${name} ==========`
  );

  console.log(
    validateNativeToolCall(
      toolName,
      args
    )
  );
}


test(
  "VALID FILE WRITE",
  "file_write_file",
  {
    path: "S:\\react-test\\test.txt",
    content: "hello",
  }
);


test(
  "BLOCK EMPTY PATH",
  "file_write_file",
  {
    path: "",
    content: "hello",
  }
);


test(
  "BLOCK MISSING CONTENT",
  "file_write_file",
  {
    path: "S:\\react-test\\test.txt",
  }
);


test(
  "BLOCK NEGATIVE MEMORY ID",
  "memory_forget",
  {
    id: -5,
  }
);


test(
  "BLOCK HUGE MEMORY LIMIT",
  "memory_search",
  {
    query: "hello",
    limit: 999999,
  }
);


test(
  "BLOCK EMPTY TERMINAL COMMAND",
  "terminal_run",
  {
    command: "",
    cwd: "S:\\react-test",
  }
);


test(
  "BLOCK UNKNOWN TOOL",
  "dangerous_fake_tool",
  {
    anything: true,
  }
);