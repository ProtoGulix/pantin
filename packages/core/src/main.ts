import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startPantinServer } from "./http/server.ts";

const DEFAULT_PORT = 4800;
const USAGE = "Usage: node packages/core/src/main.ts [--pantins-dir <path>] [--port <0-65535>]";

function parsePort(text: string | undefined): number {
  if (text === undefined) {
    return DEFAULT_PORT;
  }
  const port = Number(text);
  if (!/^\d+$/.test(text) || port > 65535) {
    throw new Error(`Invalid --port "${text}": use an integer from 0 to 65535. ${USAGE}`);
  }
  return port;
}

function reportError(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${detail}\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { "pantins-dir": { type: "string" }, port: { type: "string" } },
    strict: true,
  });
  const pantinsDirectory = resolve(values["pantins-dir"] ?? join(homedir(), "pantin-projects"));
  const port = parsePort(values.port);
  await mkdir(pantinsDirectory, { recursive: true });
  const running = await startPantinServer({ pantinsDirectory, port, reportError });
  process.stdout.write(
    `Pantin core listening on http://${running.address.address}:${running.address.port}, Pantins in ${pantinsDirectory}\n`,
  );
}

main().catch((error: unknown) => {
  reportError(error);
  process.exitCode = 1;
});
