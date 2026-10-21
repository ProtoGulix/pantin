import type { BridgeStatus, PantinId, TransportKind } from "@pantin/protocol";
import type { BridgeStartRequest } from "../domain/bridge-kinds.ts";
import type { BridgeLogLevel } from "../domain/bridge-log-lines.ts";
import { isActive } from "./bridge-entry.ts";
import {
  appendCoreLogLine,
  type BridgeSupervisorOptions,
  type Context,
  dispatch,
  entryOf,
  newContext,
  refresh,
  statusesOf,
  statusOf,
} from "./bridge-supervisor-context.ts";
import { startBridge } from "./bridge-supervisor-start.ts";

export type { BridgeLauncher, BridgeSupervisorOptions } from "./bridge-supervisor-context.ts";

// Supervises the bridge children of one core, one per (Pantin, kind) (ADR 0050,
// ADR 0065 point 5). It glues the pure state machine and checks to the process adapter,
// and holds the only mutable state: the entries of the context.

export type BridgeSupervisor = {
  status(pantinId: PantinId, kind: TransportKind): BridgeStatus;
  // One status per kind of the registry, in its order.
  statuses(pantinId: PantinId): BridgeStatus[];
  start(pantinId: PantinId, request: BridgeStartRequest): Promise<BridgeStatus>;
  stop(pantinId: PantinId, kind: TransportKind): BridgeStatus;
  // To call when the bus side of a status may have changed.
  refresh(pantinId: PantinId): void;
  // Appends a core line to the bridge log of the Pantin's `kind` (every active kind of it
  // when null); ignored when that bridge is not supervised, since a bridge started
  // elsewhere has no file (ADR 0054 amendment).
  logCoreEvent(
    pantinId: PantinId,
    kind: TransportKind | null,
    level: BridgeLogLevel,
    text: string,
  ): void;
  // The kind's bridge log file as text, empty when there is none (ADR 0054).
  readLog(pantinId: PantinId, kind: TransportKind): Promise<string>;
  // Stops every child and waits for them to be gone.
  close(): Promise<void>;
};

function stopBridge(context: Context, pantinId: PantinId, kind: TransportKind): BridgeStatus {
  const entry = entryOf(context, pantinId, kind);
  if (entry?.state.phase === "starting" || entry?.state.phase === "running") {
    dispatch(context, entry, { type: "stop_requested" });
    entry.process?.stop();
  }
  return statusOf(context, pantinId, kind);
}

async function closeAll(context: Context): Promise<void> {
  context.closed = true;
  for (const entry of context.entries.values()) {
    if (isActive(entry)) {
      stopBridge(context, entry.pantinId, entry.kind);
    }
  }
  await Promise.all([...context.liveProcesses]);
  context.passwords.clear();
  await context.options.logFile.flush();
}

export function createBridgeSupervisor(options: BridgeSupervisorOptions): BridgeSupervisor {
  const context = newContext(options);
  return {
    status: (pantinId, kind) => statusOf(context, pantinId, kind),
    statuses: (pantinId) => statusesOf(context, pantinId),
    start: (pantinId, request) => startBridge(context, pantinId, request),
    stop: (pantinId, kind) => stopBridge(context, pantinId, kind),
    refresh: (pantinId) => refresh(context, pantinId),
    logCoreEvent: (pantinId, kind, level, text) =>
      appendCoreLogLine(context, pantinId, kind, { level, text }),
    readLog: (pantinId, kind) => options.logFile.read(pantinId, kind),
    close: () => closeAll(context),
  };
}
