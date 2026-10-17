import { homedir } from "node:os";
import type { BridgeLogEnvironment } from "./bridge-log-command.ts";
import { nodeLogFileReader } from "./node-log-file-reader.ts";

// The real disk, home directory and clock of the command. A follow ends with
// the process (Ctrl-C), since nothing in the command asks it to stop.
export function realEnvironment(): BridgeLogEnvironment {
  return {
    homeDirectory: homedir(),
    reader: nodeLogFileReader,
    clock: {
      sleep: (milliseconds) =>
        new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
      shouldContinue: () => true,
    },
  };
}
