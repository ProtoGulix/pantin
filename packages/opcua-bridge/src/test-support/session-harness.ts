import { chmod, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach } from "vitest";
import { deferred } from "../deferred.ts";
import type { Logger } from "../logger.ts";
import { type ModulePlan, planModules } from "../module-plan.ts";
import { type Pki, preparePki } from "../opcua/pki.ts";
import {
  createModuleSessions,
  type ModuleSessions,
  redirectLibraryLogging,
  type SessionDependencies,
} from "../opcua/session.ts";
import {
  startTestPlcServer,
  type TestPlcOptions,
  type TestPlcServer,
  type TestVariable,
} from "./plc-server.ts";
import { type FixtureModule, opcuaProjection } from "./projection-fixtures.ts";
import { type StallProxy, startStallProxy } from "./stall-proxy.ts";
import { temporaryFolders } from "./temporary-folder.ts";

// Everything a session test needs: a PLC server in this process, Pantin's PKI, a recorded bus
// and log, and the sessions of one module that point at the server (or at a relay in front of it).

const CYLINDER_VARIABLES: readonly TestVariable[] = [
  { name: "plc_extend", dataType: "Boolean" },
  { name: "plc_out", dataType: "Boolean" },
];

type BusRecord = {
  writes: Array<{ tag: string; value: number }>;
  statuses: Array<{ connected: boolean; reason: string | null }>;
};

export type SessionHarness = {
  server: TestPlcServer;
  proxy: StallProxy | null;
  pki: Pki;
  module: ModulePlan;
  sessions: ModuleSessions;
  bus: BusRecord;
  logLines: string[];
  /** Resolves when a log line satisfies `predicate`, now or later. */
  logged(predicate: (line: string) => boolean): Promise<void>;
  /** Resolves with the first status that satisfies `predicate`, now or later. */
  status(predicate: (status: BusRecord["statuses"][number]) => boolean): Promise<void>;
  /** Resolves when a command write satisfies `predicate`, now or later. */
  write(predicate: (write: BusRecord["writes"][number]) => boolean): Promise<void>;
  /** Like `write`, but only for writes that come after the call. */
  nextWrite(predicate: (write: BusRecord["writes"][number]) => boolean): Promise<void>;
  feedback(type: "snapshot" | "tags", tags: ReadonlyArray<[string, number]>): void;
};

export type HarnessOptions = {
  pki: Pki;
  server?: Partial<TestPlcOptions>;
  module?: Omit<FixtureModule, "key" | "port">;
  password?: string;
  viaProxy?: boolean;
  session?: Partial<SessionDependencies>;
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const newFolder = temporaryFolders();

/** Pantin's PKI, created once per test file: it takes a few hundred milliseconds. */
export async function createTestPki(hostname = "workshop"): Promise<Pki> {
  return preparePki({
    directory: join(await newFolder(), "pki"),
    hostname,
    platform: "linux",
    fileSystem: { mkdir, chmod, stat, readFile, readdir, link, rm },
  });
}

type Watch<T> = {
  push(item: T): void;
  /** Resolves when an item satisfies `predicate`: one already pushed counts. */
  until(predicate: (item: T) => boolean): Promise<void>;
  /** Resolves when an item pushed after the call satisfies `predicate`. */
  next(predicate: (item: T) => boolean): Promise<void>;
};

function watchList<T>(items: T[]): Watch<T> {
  const waiting: Array<{ matches: (item: T) => boolean; done: () => void }> = [];
  const next = (matches: (item: T) => boolean): Promise<void> => {
    const signal = deferred<void>();
    waiting.push({ matches, done: () => signal.resolve() });
    return signal.promise;
  };
  return {
    push: (item) => {
      items.push(item);
      for (const wait of waiting.filter((candidate) => candidate.matches(item))) {
        wait.done();
      }
    },
    until: (predicate) => (items.some(predicate) ? Promise.resolve() : next(predicate)),
    next,
  };
}

async function startPlc(options: HarnessOptions) {
  const server = await startTestPlcServer({
    pkiFolder: await newFolder(),
    variables: CYLINDER_VARIABLES,
    ...options.server,
  });
  cleanups.push(() => server.stop());
  const proxy = options.viaProxy === true ? await startStallProxy(server.port) : null;
  if (proxy !== null) {
    cleanups.push(() => proxy.close());
  }
  return { server, proxy };
}

function planOf(options: HarnessOptions, port: number): ModulePlan {
  const plan = planModules({
    projection: opcuaProjection([{ key: "plc", ...options.module, port }]),
    targets: new Map([["plc", "127.0.0.1"]]),
    passwords: new Map(options.password === undefined ? [] : [["plc", options.password]]),
    startedByCore: true,
  });
  const module = plan.modules[0];
  if (module === undefined) {
    throw new Error("The fixture has no module.");
  }
  return module;
}

// The bus calls and the log lines the sessions make, kept in order and awaitable.
function recorders() {
  const writes: BusRecord["writes"] = [];
  const statuses: BusRecord["statuses"] = [];
  const logLines: string[] = [];
  const writeWatch = watchList(writes);
  const statusWatch = watchList(statuses);
  const logWatch = watchList(logLines);
  const log: Logger = {
    debug: logWatch.push,
    info: logWatch.push,
    warning: logWatch.push,
    error: logWatch.push,
  };
  const bus: SessionDependencies["bus"] = {
    write: (tag, value) => writeWatch.push({ tag, value }),
    plcStatus: (_module, status) =>
      statusWatch.push({
        connected: status.connected,
        reason: status.connected ? null : status.reason,
      }),
  };
  return { writes, statuses, logLines, writeWatch, statusWatch, logWatch, log, bus };
}

export async function startHarness(options: HarnessOptions): Promise<SessionHarness> {
  const { server, proxy } = await startPlc(options);
  const module = planOf(options, proxy?.port ?? server.port);
  const recorded = recorders();
  redirectLibraryLogging(recorded.log);
  const sessions = createModuleSessions({
    modules: [module],
    pki: options.pki,
    bus: recorded.bus,
    log: recorded.log,
    ...options.session,
  });
  cleanups.push(() => sessions.stop());
  return {
    server,
    proxy,
    pki: options.pki,
    module,
    sessions,
    bus: { writes: recorded.writes, statuses: recorded.statuses },
    logLines: recorded.logLines,
    logged: recorded.logWatch.until,
    status: recorded.statusWatch.until,
    write: recorded.writeWatch.until,
    nextWrite: recorded.writeWatch.next,
    feedback: (type, tags) =>
      sessions.applyTags({
        type,
        step: 0,
        tags: tags.map(([name, value]) => ({ name, value, forced: false })),
      }),
  };
}
