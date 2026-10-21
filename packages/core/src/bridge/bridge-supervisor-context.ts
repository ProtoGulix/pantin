import {
  type BridgeStatus,
  type PantinId,
  TRANSPORT_KINDS,
  type TransportKind,
} from "@pantin/protocol";
import type { ProcessSpawner } from "../converter/process-runner.ts";
import type { SupervisedBridgeClaim } from "../domain/bridge-checks.ts";
import type { BridgeLogLevel } from "../domain/bridge-log-lines.ts";
import { type BridgeEvent, nextBridgeState } from "../domain/bridge-state.ts";
import { buildBridgeStatus } from "../domain/bridge-status.ts";
import { listenChoicesOf } from "../domain/modbus-bridge-start.ts";
import type { PantinService } from "../service/pantin-service.ts";
import { type Entry, isActive, newEntry } from "./bridge-entry.ts";
import type { BridgeLogFile } from "./bridge-log-file.ts";
import { type BridgeLogSinks, logTransition } from "./bridge-supervisor-log.ts";
import { createPasswordStore, type PasswordStore } from "./opcua-passwords.ts";

// The state the supervisor's functions share, and what reads or changes it: the entries
// (one per Pantin and kind), the status built from them and the one place that applies an
// event to an entry (ADR 0050, ADR 0065 point 5).

/**
 * The program of one kind: `command` and the fixed `args` that come before the arguments
 * every bridge takes. Built only in main.ts, the one place that pairs a kind with a program.
 */
export type BridgeLauncher = {
  kind: TransportKind;
  command: string;
  args: readonly string[];
  // Settings of the host that every start of this kind shares (the OPC UA PKI folder), after
  // the arguments every bridge takes and before the kind's own.
  hostArguments?: readonly string[];
  // The whole environment of the child; absent, it inherits the core's.
  environment?: Readonly<Record<string, string>>;
};

export type BridgeSupervisorOptions = {
  // The kinds the core can start; any other kind is `unavailable`.
  launchers: readonly BridgeLauncher[];
  spawn: ProcessSpawner;
  service: Pick<
    PantinService,
    | "readIo"
    | "peekBridgeBusFacts"
    | "recordBridgeFailure"
    | "recordBridgeLog"
    | "recordOpcuaUnsecuredLan"
  >;
  // Where the core listens now; read at each start, after the server is bound.
  coreAddress: () => { host: string; port: number };
  // Every address of the host's interfaces (os.networkInterfaces in the real core).
  hostAddresses: () => readonly string[];
  // Receives each bridge log line, to copy it to the core's stderr.
  mirrorLogLine: (pantinId: PantinId, line: string) => void;
  // The bridge log files of each Pantin and kind (ADR 0054).
  logFile: BridgeLogFile;
  // Called when the status of one of a Pantin's bridges changed.
  onChange: (pantinId: PantinId) => void;
  reportError: (error: unknown) => void;
  startTimeoutMs: number;
  killGraceMs: number;
  // Where the OPC UA passwords live (ADR 0065 point 9); injected so that a test can look at
  // it. A fresh store when absent.
  passwordStore?: PasswordStore;
};

export type Context = {
  options: BridgeSupervisorOptions;
  entries: Map<string, Entry>;
  liveProcesses: Set<Promise<void>>;
  // The last statuses text sent per Pantin, so that only a change is published.
  published: Map<PantinId, string>;
  // The OPC UA passwords, in memory only (ADR 0065 point 9).
  passwords: PasswordStore;
  // Set when close() began: a later start would spawn a child nobody waits for.
  closed: boolean;
};

export function newContext(options: BridgeSupervisorOptions): Context {
  return {
    options,
    entries: new Map(),
    liveProcesses: new Set(),
    published: new Map(),
    passwords: options.passwordStore ?? createPasswordStore(),
    closed: false,
  };
}

// A kind name has no colon, so the key is unambiguous.
function entryKeyOf(pantinId: PantinId, kind: TransportKind): string {
  return `${kind}:${pantinId}`;
}

export function entryOf(
  context: Context,
  pantinId: PantinId,
  kind: TransportKind,
): Entry | undefined {
  return context.entries.get(entryKeyOf(pantinId, kind));
}

export function entryForStart(context: Context, pantinId: PantinId, kind: TransportKind): Entry {
  const key = entryKeyOf(pantinId, kind);
  const entry = context.entries.get(key) ?? newEntry(pantinId, kind);
  context.entries.set(key, entry);
  return entry;
}

export function launcherOf(context: Context, kind: TransportKind): BridgeLauncher | undefined {
  return context.options.launchers.find((launcher) => launcher.kind === kind);
}

export function statusOf(context: Context, pantinId: PantinId, kind: TransportKind): BridgeStatus {
  const { options } = context;
  return buildBridgeStatus({
    kind,
    availability: launcherOf(context, kind) === undefined ? "unavailable" : "available",
    view: entryOf(context, pantinId, kind),
    bus: options.service.peekBridgeBusFacts(pantinId, kind),
    listenChoices: listenChoicesOf(options.hostAddresses()),
  });
}

// One status per kind of the registry, in its order.
export function statusesOf(context: Context, pantinId: PantinId): BridgeStatus[] {
  return TRANSPORT_KINDS.map((kind) => statusOf(context, pantinId, kind));
}

export function refresh(context: Context, pantinId: PantinId): void {
  const text = JSON.stringify(statusesOf(context, pantinId));
  if (context.published.get(pantinId) !== text) {
    context.published.set(pantinId, text);
    context.options.onChange(pantinId);
  }
}

export function sinksOf(context: Context): BridgeLogSinks {
  const { options } = context;
  return {
    logFile: options.logFile,
    recordConsole: options.service.recordBridgeLog,
    reportError: options.reportError,
  };
}

export function dispatch(context: Context, entry: Entry, event: BridgeEvent): void {
  const before = entry.state;
  entry.state = nextBridgeState(before, event);
  logTransition(sinksOf(context), entry, {
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
    service.recordBridgeFailure(entry.pantinId, entry.state.failure).catch(reportError);
  }
  refresh(context, entry.pantinId);
}

// What every active bridge holds, for the checks of a new start.
export function activeClaims(context: Context): SupervisedBridgeClaim[] {
  return [...context.entries.values()].flatMap((entry) =>
    isActive(entry)
      ? [{ pantinId: entry.pantinId, kind: entry.kind, listen: entry.listen, ports: entry.ports }]
      : [],
  );
}

export function appendCoreLogLine(
  context: Context,
  pantinId: PantinId,
  kind: TransportKind | null,
  line: { level: BridgeLogLevel; text: string },
): void {
  const entries = [...context.entries.values()].filter(
    (entry) =>
      entry.pantinId === pantinId && isActive(entry) && (kind === null || entry.kind === kind),
  );
  for (const entry of entries) {
    context.options.logFile.coreEvent(pantinId, entry.kind, line.level, line.text);
  }
}
