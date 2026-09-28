import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { StartupRefusedError, startPantinServer } from "./http/server.ts";

const DEFAULT_PORT = 4800;
const USAGE = [
  "Usage: node packages/core/src/main.ts [--pantins-dir <path>] [--port <0-65535>]",
  "  [--listen <127.0.0.1 or one private address>] [--allow <ip or cidr>]... [--viewer-dir <path>]",
].join("\n");

function parsePort(text: string | undefined): number {
  if (text === undefined) {
    return DEFAULT_PORT;
  }
  const port = Number(text);
  if (!/^\d+$/.test(text) || port > 65535) {
    throw new StartupRefusedError(`Invalid --port "${text}": use an integer from 0 to 65535.`);
  }
  return port;
}

async function resolveViewerDirectory(text: string | undefined): Promise<string | undefined> {
  if (text === undefined) {
    return undefined;
  }
  const directory = resolve(text);
  const isDirectory = await stat(directory).then(
    (stats) => stats.isDirectory(),
    (error: unknown) => {
      // Only a missing path means "build first"; permission or I/O errors must surface as is.
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
  if (!isDirectory) {
    throw new StartupRefusedError(
      `--viewer-dir "${directory}" is not a directory. Build the viewer first: pnpm --filter @pantin/viewer build.`,
    );
  }
  return directory;
}

function writeLine(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

function reportError(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  writeLine(process.stderr, detail);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "pantins-dir": { type: "string" },
      port: { type: "string" },
      listen: { type: "string" },
      allow: { type: "string", multiple: true },
      "viewer-dir": { type: "string" },
    },
    strict: true,
  });
  const pantinsDirectory = resolve(values["pantins-dir"] ?? join(homedir(), "pantin-projects"));
  const port = parsePort(values.port);
  const viewerDirectory = await resolveViewerDirectory(values["viewer-dir"]);
  await mkdir(pantinsDirectory, { recursive: true });
  const running = await startPantinServer({
    pantinsDirectory,
    port,
    ...(values.listen === undefined ? {} : { listen: values.listen }),
    allow: values.allow ?? [],
    ...(viewerDirectory === undefined ? {} : { viewerDirectory }),
    reportError,
    reportRejectedSource: (source) =>
      writeLine(process.stderr, `Rejected connection from ${source}`),
  });
  const { address, network } = running;
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  writeLine(process.stdout, `Pantin core (${network.mode} mode) on http://${host}:${address.port}`);
  writeLine(process.stdout, `Pantins in ${pantinsDirectory}`);
  if (viewerDirectory !== undefined) {
    writeLine(process.stdout, `Viewer served from ${viewerDirectory}`);
  }
}

function isArgumentParsingError(error: unknown): error is TypeError {
  return (
    error instanceof TypeError &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("ERR_PARSE_ARGS_")
  );
}

main().catch((error: unknown) => {
  if (error instanceof StartupRefusedError || isArgumentParsingError(error)) {
    // Expected refusals (unsafe address, bad arguments): message only, no stack.
    writeLine(process.stderr, `${error.message}\n${USAGE}`);
  } else {
    reportError(error);
  }
  process.exitCode = 1;
});
