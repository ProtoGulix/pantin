import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { MODBUS_TCP_SLAVE_KIND } from "@pantin/protocol";
import type { BridgeLauncher } from "./bridge/bridge-supervisor.ts";
import { resolveOpcuaLauncher } from "./bridge/opcua-launcher.ts";
import { readBuildVersion } from "./build-version.ts";
import { defaultPantinsDirectory } from "./domain/default-directories.ts";
import {
  type PantinServerOptions,
  type RunningPantinServer,
  StartupRefusedError,
  startPantinServer,
} from "./http/server.ts";
import { createPhysicsWorldFactory, loadRapier } from "./physics/rapier-world.ts";

const DEFAULT_PORT = 4800;
// This file is packages/core/src/main.ts.
const REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const USAGE = [
  "Usage: node packages/core/src/main.ts [--pantins-dir <path>] [--port <0-65535>]",
  "  [--listen <127.0.0.1 or one private address>] [--allow <ip or cidr>]... [--viewer-dir <path>]",
  "  [--examples-dir <path>]",
  "  [--step-converter-python <python of the step-converter venv>]",
  "  [--bridge-python <python of the bridge venv>] [--logs-dir <path>]",
  "  [--opcua-bridge <entry file of the OPC UA bridge>] [--opcua-pki-dir <path>]",
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

// Only a missing path means "not there"; permission or I/O errors must surface as is.
async function isExisting(path: string, type: "file" | "directory"): Promise<boolean> {
  return stat(path).then(
    (stats) => (type === "file" ? stats.isFile() : stats.isDirectory()),
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}

async function resolveViewerDirectory(text: string | undefined): Promise<string | undefined> {
  if (text === undefined) {
    return undefined;
  }
  const directory = resolve(text);
  if (!(await isExisting(directory, "directory"))) {
    throw new StartupRefusedError(
      `--viewer-dir "${directory}" is not a directory. Build the viewer first: pnpm --filter @pantin/viewer build.`,
    );
  }
  return directory;
}

// Like --viewer-dir: an explicit folder, never a guessed layout (ADR 0062 point 1).
async function resolveExamplesDirectory(text: string | undefined): Promise<string | undefined> {
  if (text === undefined) {
    return undefined;
  }
  const directory = resolve(text);
  if (!(await isExisting(directory, "directory"))) {
    throw new StartupRefusedError(`--examples-dir "${directory}" is not a directory.`);
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
  if (!(await isExisting(path, "file"))) {
    throw new StartupRefusedError(
      `--bridge-python "${path}" is not a file. Create the bridge environment first: pnpm setup:python.`,
    );
  }
  return path;
}

// The program of the Modbus bridge: main.ts is the one place that pairs a kind with a
// program (ADR 0065 point 4). `-I` ignores PYTHON* variables and the user site.
function modbusLauncherOf(pythonPath: string): BridgeLauncher {
  return {
    kind: MODBUS_TCP_SLAVE_KIND,
    command: pythonPath,
    args: ["-I", "-u", "-m", "pantin_bridge"],
  };
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
  opcuaBridge: string | undefined;
  viewerDirectory: string | undefined;
  examplesDirectory: string | undefined;
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
  writeLine(
    process.stdout,
    summary.opcuaBridge === undefined
      ? "OPC UA bridge disabled (no --opcua-bridge)"
      : `OPC UA bridge: ${summary.opcuaBridge}`,
  );
  writeLine(
    process.stdout,
    summary.examplesDirectory === undefined
      ? "Examples disabled (no --examples-dir)"
      : `Examples from ${summary.examplesDirectory}`,
  );
  if (summary.viewerDirectory !== undefined) {
    writeLine(process.stdout, `Viewer served from ${summary.viewerDirectory}`);
  }
}

const COMMAND_LINE_OPTIONS = {
  "pantins-dir": { type: "string" },
  port: { type: "string" },
  listen: { type: "string" },
  allow: { type: "string", multiple: true },
  "viewer-dir": { type: "string" },
  "examples-dir": { type: "string" },
  "step-converter-python": { type: "string" },
  "bridge-python": { type: "string" },
  "opcua-bridge": { type: "string" },
  "opcua-pki-dir": { type: "string" },
  "logs-dir": { type: "string" },
} as const;

interface OptionalSettings {
  listen: string | undefined;
  viewerDirectory: string | undefined;
  examplesDirectory: string | undefined;
  stepConverterPython: string | undefined;
  bridgeLaunchers: BridgeLauncher[];
  logsDirectory: string | undefined;
}

// Only the options the user gave: the server tells "not given" from "empty". Spelled out so
// that the compiler checks each name and type against PantinServerOptions.
function optionalServerOptions(settings: OptionalSettings): Partial<PantinServerOptions> {
  const { listen, viewerDirectory, examplesDirectory } = settings;
  const { stepConverterPython, bridgeLaunchers, logsDirectory } = settings;
  return {
    ...(listen === undefined ? {} : { listen }),
    ...(viewerDirectory === undefined ? {} : { viewerDirectory }),
    ...(examplesDirectory === undefined ? {} : { examplesDirectory }),
    ...(stepConverterPython === undefined ? {} : { stepConverterPython }),
    ...(bridgeLaunchers.length === 0 ? {} : { bridgeLaunchers }),
    ...(logsDirectory === undefined ? {} : { logsDirectory }),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: COMMAND_LINE_OPTIONS, strict: true });
  const pantinsDirectory = resolve(values["pantins-dir"] ?? defaultPantinsDirectory(homedir()));
  const logsDirectory = values["logs-dir"] === undefined ? undefined : resolve(values["logs-dir"]);
  const port = parsePort(values.port);
  const viewerDirectory = await resolveViewerDirectory(values["viewer-dir"]);
  const examplesDirectory = await resolveExamplesDirectory(values["examples-dir"]);
  const stepConverterPython = values["step-converter-python"];
  const bridgePython = await requireBridgePython(values["bridge-python"]);
  await mkdir(pantinsDirectory, { recursive: true });
  const opcua = await resolveOpcuaLauncher({
    entryOption: values["opcua-bridge"],
    pkiOption: values["opcua-pki-dir"],
    pantinsDirectory,
    nodePath: process.execPath,
    environment: process.env,
    homeDirectory: homedir(),
  });
  if (!opcua.ok) {
    throw new StartupRefusedError(opcua.message);
  }
  const bridgeLaunchers = [
    ...(bridgePython === undefined ? [] : [modbusLauncherOf(bridgePython)]),
    ...(opcua.launcher === undefined ? [] : [opcua.launcher]),
  ];
  // Once at start-up (about 73 ms): the WASM module is shared by every Pantin's world.
  const physicsWorldFactory = createPhysicsWorldFactory(await loadRapier());
  const running = await startPantinServer({
    pantinsDirectory,
    port,
    buildVersion: readBuildVersion(REPOSITORY_ROOT),
    allow: values.allow ?? [],
    physicsWorldFactory,
    ...optionalServerOptions({
      listen: values.listen,
      viewerDirectory,
      examplesDirectory,
      stepConverterPython,
      bridgeLaunchers,
      logsDirectory,
    }),
    reportBridgeLine: (pantinId, line) => writeLine(process.stderr, `[bridge ${pantinId}] ${line}`),
    reportError,
    reportRejectedSource: (source) =>
      writeLine(process.stderr, `Rejected connection from ${source}`),
  });
  printStartup(running, {
    pantinsDirectory,
    stepConverterPython,
    bridgePython,
    opcuaBridge: opcua.launcher?.args[0],
    viewerDirectory,
    examplesDirectory,
  });
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
