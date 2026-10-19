import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readBuildVersion } from "./build-version.ts";
import { defaultPantinsDirectory } from "./domain/default-directories.ts";
import { type RunningPantinServer, StartupRefusedError, startPantinServer } from "./http/server.ts";
import { createPhysicsWorldFactory, loadRapier } from "./physics/rapier-world.ts";

const DEFAULT_PORT = 4800;
// This file is packages/core/src/main.ts.
const REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const USAGE = [
  "Usage: node packages/core/src/main.ts [--pantins-dir <path>] [--port <0-65535>]",
  "  [--listen <127.0.0.1 or one private address>] [--allow <ip or cidr>]... [--viewer-dir <path>]",
  "  [--step-converter-python <python of the step-converter venv>]",
  "  [--bridge-python <python of the bridge venv>] [--logs-dir <path>]",
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

// The bridge's Python must exist at start-up: a typo would otherwise show only
// when the user clicks Start (ADR 0050 point 1).
async function requireBridgePython(text: string | undefined): Promise<string | undefined> {
  if (text === undefined) {
    return undefined;
  }
  const path = resolve(text);
  const isFile = await stat(path).then(
    (stats) => stats.isFile(),
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
  if (!isFile) {
    throw new StartupRefusedError(
      `--bridge-python "${path}" is not a file. Create the bridge environment first: pnpm setup:python.`,
    );
  }
  return path;
}

function writeLine(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

function reportError(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  writeLine(process.stderr, detail);
}

// Ctrl-C and SIGTERM close the core, which stops its bridges (ADR 0050 point 7);
// without this the bridge children would outlive a killed core by their own timeout.
function closeOnSignals(close: () => Promise<void>): void {
  let closing = false;
  const closeOnce = (): void => {
    if (closing) {
      process.exit(1); // A second signal forces out a close() that is stuck.
    }
    closing = true;
    close().then(
      () => process.exit(0),
      (error: unknown) => {
        reportError(error);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", closeOnce);
  process.on("SIGTERM", closeOnce);
}

type StartupSummary = {
  pantinsDirectory: string;
  stepConverterPython: string | undefined;
  bridgePython: string | undefined;
  viewerDirectory: string | undefined;
};

function printStartup(running: RunningPantinServer, summary: StartupSummary): void {
  const { address, network } = running;
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  writeLine(process.stdout, `Pantin core (${network.mode} mode) on http://${host}:${address.port}`);
  writeLine(process.stdout, `Pantins in ${summary.pantinsDirectory}`);
  writeLine(
    process.stdout,
    summary.stepConverterPython === undefined
      ? "STEP import disabled (no --step-converter-python)"
      : `STEP converter: ${summary.stepConverterPython}`,
  );
  writeLine(
    process.stdout,
    summary.bridgePython === undefined
      ? "PLC bridge disabled (no --bridge-python)"
      : `PLC bridge: ${summary.bridgePython}`,
  );
  if (summary.viewerDirectory !== undefined) {
    writeLine(process.stdout, `Viewer served from ${summary.viewerDirectory}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "pantins-dir": { type: "string" },
      port: { type: "string" },
      listen: { type: "string" },
      allow: { type: "string", multiple: true },
      "viewer-dir": { type: "string" },
      "step-converter-python": { type: "string" },
      "bridge-python": { type: "string" },
      "logs-dir": { type: "string" },
    },
    strict: true,
  });
  const pantinsDirectory = resolve(values["pantins-dir"] ?? defaultPantinsDirectory(homedir()));
  const logsDirectory = values["logs-dir"] === undefined ? undefined : resolve(values["logs-dir"]);
  const port = parsePort(values.port);
  const viewerDirectory = await resolveViewerDirectory(values["viewer-dir"]);
  const stepConverterPython = values["step-converter-python"];
  const bridgePython = await requireBridgePython(values["bridge-python"]);
  await mkdir(pantinsDirectory, { recursive: true });
  // Once at start-up (about 73 ms): the WASM module is shared by every Pantin's world.
  const physicsWorldFactory = createPhysicsWorldFactory(await loadRapier());
  const running = await startPantinServer({
    pantinsDirectory,
    port,
    buildVersion: readBuildVersion(REPOSITORY_ROOT),
    ...(values.listen === undefined ? {} : { listen: values.listen }),
    allow: values.allow ?? [],
    physicsWorldFactory,
    ...(viewerDirectory === undefined ? {} : { viewerDirectory }),
    ...(stepConverterPython === undefined ? {} : { stepConverterPython }),
    ...(bridgePython === undefined ? {} : { bridgePython }),
    ...(logsDirectory === undefined ? {} : { logsDirectory }),
    reportBridgeLine: (pantinId, line) => writeLine(process.stderr, `[bridge ${pantinId}] ${line}`),
    reportError,
    reportRejectedSource: (source) =>
      writeLine(process.stderr, `Rejected connection from ${source}`),
  });
  printStartup(running, { pantinsDirectory, stepConverterPython, bridgePython, viewerDirectory });
  closeOnSignals(running.close);
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
