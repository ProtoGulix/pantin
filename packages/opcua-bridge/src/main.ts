import { chmod, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { hostname, platform } from "node:os";
import { createLogger } from "./logger.ts";
import { installStdoutGuard } from "./stdout-guard.ts";

// Entry of the OPC UA client bridge: `node main.ts --status-lines --core <url> ...`
// (ADR 0065 point 5). The order of the lines below matters:
//
// 1. The stdout guard is installed first. node-opcua prints on stdout, and the core reads
//    every stdout line as a status line.
// 2. run.ts, and through it node-opcua, is loaded after that, by a dynamic import. A static
//    import would be evaluated before this file's body runs, so before the guard. The
//    dependency-cruiser rule "main-loads-the-bridge-dynamically" keeps it that way.
const writeStatusLine = installStdoutGuard(process.stdout, process.stderr);

// 3. SIGTERM is listened to before the import too: the import takes a while, and a signal
//    that arrives meanwhile must not find the default handler, which ends the process by the
//    signal instead of with exit code 0.
const terminated = new Promise<void>((resolve) => {
  process.once("SIGTERM", () => resolve());
});

const { runBridge } = await import("./run.ts");

const exitCode = await runBridge({
  argv: process.argv.slice(2),
  stdin: process.stdin,
  fetcher: fetch,
  hostname: hostname(),
  platform: platform(),
  fileSystem: { mkdir, chmod, stat, readFile, readdir, link, rm },
  writeStatusLine,
  log: createLogger(
    (line) => process.stderr.write(`${line}\n`),
    () => new Date(),
  ),
  terminated,
});

// node-opcua may keep timers alive: the bridge ends here, after its last line was flushed.
process.exit(exitCode);
