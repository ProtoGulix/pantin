import { runCommand } from "./cli.ts";

// The pantin command, run from the repository: `pnpm pantin <command>`.
// Nothing is published under this name yet (CLAUDE.md section 4).
process.exitCode = await runCommand(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
});
