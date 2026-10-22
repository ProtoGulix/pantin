import { format } from "node:util";
import type { TagBusServerMessage } from "@pantin/protocol";
import { setDebugLogger, setErrorLogger, setWarningLogger } from "node-opcua-client";
import type { BusClient } from "../bus-client.ts";
import { deferred } from "../deferred.ts";
import type { BridgeError } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type { ModulePlan } from "../module-plan.ts";
import { DEFAULT_RETRY_TIMINGS, type RetryTimings } from "../retry-policy.ts";
import { guardOutgoingSockets } from "../socket-guard.ts";
import { REAL_TIMERS, type Timers } from "../watchdog.ts";
import { createModuleSession } from "./module-session.ts";
import type { Pki } from "./pki.ts";

// The OPC UA sessions of the bridge (ADR 0065 points 2, 5, 6, 10 and 11). Only the files of
// this folder import node-opcua: the library stays behind this adapter.

/**
 * node-opcua prints with console.log by default (spike 0013 section 6). Its debug, warning and
 * error loggers are replaced so that its messages join the bridge's log with their level (its
 * trace logger is not re-exported by node-opcua-client, so it still prints). The stdout guard
 * stays behind this as the guaranteed fallback (ADR 0065 point 1).
 */
export function redirectLibraryLogging(log: Logger): void {
  const to =
    (write: (message: string) => void) =>
    // The first argument is the caller's context (file and line), not a message.
    (_context?: unknown, ...messageParts: unknown[]): void =>
      write(`node-opcua: ${format(...messageParts)}`);
  setDebugLogger(to(log.debug));
  setWarningLogger(to(log.warning));
  setErrorLogger(to(log.error));
}

export type SessionDependencies = {
  modules: readonly ModulePlan[];
  pki: Pki;
  /** The bus calls the sessions make: PLC writes of commands, and `plc_status`. */
  bus: Pick<BusClient, "write" | "plcStatus">;
  log: Logger;
  /** How long a module waits before it tries again; tests shorten it. */
  retry?: RetryTimings;
  timers?: Timers;
  /** Watches the sockets of the sessions (ADR 0065 point 8); tests with a relay replace it. */
  guardSockets?: typeof guardOutgoingSockets;
};

export type ModuleSessions = {
  /**
   * Starts every module's session in the background and returns at once: a PLC that is stopped
   * is a module state (`plc_status`), not a start failure (ADR 0065 point 5).
   */
  start(): void;
  /** Core to PLC: the `snapshot` and `tags` messages, whose feedback goes to the nodes. */
  applyTags(message: Extract<TagBusServerMessage, { type: "snapshot" | "tags" }>): void;
  /**
   * Settles with the first failure that ends the whole bridge: an untrusted or invalid server
   * certificate, a refused login (ADR 0065 points 9 and 10). Never rejects.
   */
  failed: Promise<BridgeError>;
  /** Closes every session; the bridge exits after it. */
  stop(): Promise<void>;
};

export function createModuleSessions(dependencies: SessionDependencies): ModuleSessions {
  const { modules, log } = dependencies;
  // The core's latest feedback values, shared by the modules: a session that opens later writes
  // them all, so nothing the core said while the PLC was away is lost.
  const feedbackValues = new Map<string, number>();
  const failed = deferred<BridgeError>();
  const sessions = modules.map((module) =>
    createModuleSession({
      module,
      pki: dependencies.pki,
      bus: dependencies.bus,
      log,
      retry: dependencies.retry ?? DEFAULT_RETRY_TIMINGS,
      timers: dependencies.timers ?? REAL_TIMERS,
      // The first failure wins: the bridge exits with that one.
      onFatal: (error) => failed.resolve(error),
      feedbackValues,
    }),
  );
  let stopGuard: (() => void) | null = null;
  return {
    failed: failed.promise,
    start: () => {
      stopGuard = (dependencies.guardSockets ?? guardOutgoingSockets)(
        modules.map(({ target, transport }) => ({ target, port: transport.port })),
        log,
      );
      for (const session of sessions) {
        session.start();
      }
    },
    applyTags: (message) => {
      const changed: string[] = [];
      for (const tag of message.tags) {
        if (feedbackValues.get(tag.name) !== tag.value) {
          feedbackValues.set(tag.name, tag.value);
          changed.push(tag.name);
        }
      }
      for (const session of sessions) {
        session.writeFeedback(message.type === "snapshot" ? "all" : changed);
      }
    },
    stop: async () => {
      await Promise.all(sessions.map((session) => session.stop()));
      stopGuard?.();
    },
  };
}
