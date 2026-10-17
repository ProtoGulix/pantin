import type { BridgeNetwork, BridgeStatus, PantinId } from "@pantin/protocol";
import type { ProcessSpawner } from "../converter/process-runner.ts";
import {
  checkBridgeStart,
  listenChoicesOf,
  type SupervisedBridgeClaim,
} from "../domain/bridge-checks.ts";
import { appendLogLine, bridgeArguments, truncateLogLine } from "../domain/bridge-output.ts";
import { type BridgeEvent, nextBridgeState } from "../domain/bridge-state.ts";
import { buildBridgeStatus } from "../domain/bridge-status.ts";
import { describeIoProblem } from "../domain/io-problem-text.ts";
import { ApiError } from "../errors.ts";
import type { PantinService } from "../service/pantin-service.ts";
import { type Entry, isActive, newEntry } from "./bridge-entry.ts";
import type { BridgeLogFile } from "./bridge-log-file.ts";
import { type BridgeProcessHandlers, startBridgeProcess } from "./bridge-process.ts";
import { type BridgeLogSinks, logBridgeLine, logTransition } from "./bridge-supervisor-log.ts";

// Supervises the bridge children of one core, one per Pantin (ADR 0050). It
// glues the pure state machine and checks to the process adapter, and holds
// the only mutable state: the entries below.

const FIRST_PROBLEMS = 3;

export type BridgeSupervisorOptions = {
  // Python of the bridge's venv; undefined when the core has no --bridge-python.
  pythonPath: string | undefined;
  spawn: ProcessSpawner;
  service: Pick<
    PantinService,
    "readIo" | "peekBridgeBusFacts" | "recordBridgeFailure" | "recordBridgeLog"
  >;
  // Where the core listens now; read at each start, after the server is bound.
  coreAddress: () => { host: string; port: number };
  // Every address of the host's interfaces (os.networkInterfaces in the real core).
  hostAddresses: () => readonly string[];
  // Receives each bridge log line, to copy it to the core's stderr.
  mirrorLogLine: (pantinId: PantinId, line: string) => void;
  // The bridge log file of each Pantin (ADR 0054).
  logFile: BridgeLogFile;
  // Called when the status of a Pantin's bridge changed.
  onChange: (pantinId: PantinId) => void;
  reportError: (error: unknown) => void;
  startTimeoutMs: number;
  killGraceMs: number;
};

export type BridgeSupervisor = {
  status(pantinId: PantinId): BridgeStatus;
  start(
    pantinId: PantinId,
    request: { listen: string; allow: readonly string[] },
  ): Promise<BridgeStatus>;
  stop(pantinId: PantinId): BridgeStatus;
  // To call when the bus side of a status may have changed.
  refresh(pantinId: PantinId): void;
  // The bridge log file as text, empty when there is none (ADR 0054).
  readLog(pantinId: PantinId): Promise<string>;
  // Stops every child and waits for them to be gone.
  close(): Promise<void>;
};

type Context = {
  options: BridgeSupervisorOptions;
  entries: Map<PantinId, Entry>;
  liveProcesses: Set<Promise<void>>;
  // The last status text sent per Pantin, so that only a change is published.
  published: Map<PantinId, string>;
  // Set when close() began: a later start would spawn a child nobody waits for.
  closed: boolean;
};

function statusOf(context: Context, pantinId: PantinId): BridgeStatus {
  const { options } = context;
  return buildBridgeStatus({
    availability: options.pythonPath === undefined ? "unavailable" : "available",
    view: context.entries.get(pantinId),
    bus: options.service.peekBridgeBusFacts(pantinId),
    listenChoices: listenChoicesOf(options.hostAddresses()),
  });
}

function refresh(context: Context, pantinId: PantinId): void {
  const text = JSON.stringify(statusOf(context, pantinId));
  if (context.published.get(pantinId) !== text) {
    context.published.set(pantinId, text);
    context.options.onChange(pantinId);
  }
}

function sinksOf(context: Context): BridgeLogSinks {
  const { options } = context;
  return {
    logFile: options.logFile,
    recordConsole: options.service.recordBridgeLog,
    reportError: options.reportError,
  };
}

function dispatch(context: Context, pantinId: PantinId, entry: Entry, event: BridgeEvent): void {
  const before = entry.state;
  entry.state = nextBridgeState(before, event);
  logTransition(sinksOf(context), pantinId, {
    before,
    after: entry.state,
    event,
    network: entry.network,
  });
  if (entry.state.phase !== "starting") {
    clearTimeout(entry.startTimer);
  }
  if (entry.state.phase === "failed" && before.phase !== "failed") {
    const { service, reportError } = context.options;
    service.recordBridgeFailure(pantinId, entry.state.failure).catch(reportError);
  }
  refresh(context, pantinId);
}

// Events of a child that a newer start replaced are not this entry's business.
function handlersFor(
  context: Context,
  pantinId: PantinId,
  entry: Entry,
  generation: number,
): BridgeProcessHandlers {
  const current = (action: () => void): void => {
    if (entry.generation === generation) {
      action();
    }
  };
  return {
    onStatusLine: (line) =>
      current(() => {
        if (line.event === "ready") {
          dispatch(context, pantinId, entry, { type: "ready", modules: line.modules });
        } else {
          entry.exiting = line;
        }
      }),
    onLogLine: (line) =>
      current(() => {
        entry.log = appendLogLine(entry.log, line);
        context.options.mirrorLogLine(pantinId, truncateLogLine(line));
        logBridgeLine(sinksOf(context), pantinId, line);
        refresh(context, pantinId);
      }),
    onSpawnError: (error) =>
      current(() => {
        entry.process = undefined;
        const message = `Cannot run the bridge's Python (${error.message}). Run pnpm setup:python.`;
        dispatch(context, pantinId, entry, { type: "spawn_failed", message });
      }),
    onExit: ({ exitCode, signal }) =>
      current(() => {
        entry.process = undefined;
        const exiting = entry.exiting;
        dispatch(context, pantinId, entry, { type: "exited", exitCode, signal, exiting });
      }),
  };
}

function spawnFor(context: Context, pantinId: PantinId, entry: Entry, network: BridgeNetwork) {
  const { options } = context;
  entry.generation += 1;
  const generation = entry.generation;
  const args = bridgeArguments({ core: options.coreAddress(), pantinId, network });
  const handle = startBridgeProcess(
    options.spawn,
    options.pythonPath ?? "",
    args,
    options.killGraceMs,
    handlersFor(context, pantinId, entry, generation),
  );
  entry.process = handle;
  context.liveProcesses.add(handle.exited);
  void handle.exited.then(() => context.liveProcesses.delete(handle.exited));
  if (entry.state.phase !== "starting") {
    return; // The interpreter could not even be run: nothing to wait for.
  }
  entry.startTimer = setTimeout(() => {
    if (entry.generation === generation) {
      dispatch(context, pantinId, entry, { type: "start_timed_out" });
      handle.stop();
    }
  }, options.startTimeoutMs);
  entry.startTimer.unref();
}

function activeClaims(context: Context): SupervisedBridgeClaim[] {
  return [...context.entries.entries()].flatMap(([pantinId, entry]) =>
    isActive(entry) && entry.network !== null
      ? [{ pantinId, listen: entry.network.listen, ports: entry.ports }]
      : [],
  );
}

function stopBridge(context: Context, pantinId: PantinId): BridgeStatus {
  const entry = context.entries.get(pantinId);
  if (entry?.state.phase === "starting" || entry?.state.phase === "running") {
    dispatch(context, pantinId, entry, { type: "stop_requested" });
    entry.process?.stop();
  }
  return statusOf(context, pantinId);
}

const UNAVAILABLE_MESSAGE =
  "The PLC bridge is not configured: start the core with --bridge-python <python of the bridge venv> (pnpm setup:python).";

function refuseWhenClosed(context: Context): void {
  if (context.closed) {
    throw new ApiError("conflict", "The core is shutting down: the bridge is not started.");
  }
}

async function startBridge(
  context: Context,
  pantinId: PantinId,
  request: { listen: string; allow: readonly string[] },
): Promise<BridgeStatus> {
  const { options } = context;
  if (options.pythonPath === undefined) {
    throw new ApiError("bridge_unavailable", UNAVAILABLE_MESSAGE);
  }
  refuseWhenClosed(context);
  const mapping = await options.service.readIo(pantinId);
  refuseWhenClosed(context);
  const result = checkBridgeStart(pantinId, request, {
    hostAddresses: options.hostAddresses(),
    mapping: {
      status: mapping.status,
      modules: mapping.modules,
      problems: mapping.problems.slice(0, FIRST_PROBLEMS).map(describeIoProblem),
    },
    externalBridgeConnected: statusOf(context, pantinId).externalBridgeConnected,
    core: options.coreAddress(),
    activeBridges: activeClaims(context),
  });
  if (!result.ok) {
    throw new ApiError(result.refusal.code, result.refusal.message);
  }
  const entry = context.entries.get(pantinId) ?? newEntry();
  context.entries.set(pantinId, entry);
  Object.assign(entry, {
    network: result.network,
    ports: mapping.modules.map(({ port }) => port),
    log: [],
    exiting: undefined,
  });
  dispatch(context, pantinId, entry, { type: "start_requested" });
  spawnFor(context, pantinId, entry, result.network);
  return statusOf(context, pantinId);
}

export function createBridgeSupervisor(options: BridgeSupervisorOptions): BridgeSupervisor {
  const context: Context = {
    options,
    entries: new Map(),
    liveProcesses: new Set(),
    published: new Map(),
    closed: false,
  };
  return {
    status: (pantinId) => statusOf(context, pantinId),
    start: (pantinId, request) => startBridge(context, pantinId, request),
    stop: (pantinId) => stopBridge(context, pantinId),
    refresh: (pantinId) => refresh(context, pantinId),
    readLog: (pantinId) => options.logFile.read(pantinId),
    close: async () => {
      context.closed = true;
      for (const pantinId of context.entries.keys()) {
        stopBridge(context, pantinId);
      }
      await Promise.all([...context.liveProcesses]);
      await options.logFile.flush();
    },
  };
}
