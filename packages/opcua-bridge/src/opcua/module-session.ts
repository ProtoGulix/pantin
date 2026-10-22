import type { PlcModuleLossReason } from "@pantin/protocol";
import type { BusClient } from "../bus-client.ts";
import { deferred } from "../deferred.ts";
import { BridgeError } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type { ModulePlan } from "../module-plan.ts";
import { createRetryPolicy, type RetryPolicy, type RetryTimings } from "../retry-policy.ts";
import { startWatchdog, type Timers } from "../watchdog.ts";
import { type Connection, openConnection } from "./connection.ts";
import { ClientCertificateRefusedError } from "./connection-failure.ts";
import { startMonitoring } from "./monitoring.ts";
import { type PreparedNodes, prepareNodes } from "./node-preparation.ts";
import type { Pki } from "./pki.ts";
import { WriteQueue } from "./write-queue.ts";

// The life of one module (ADR 0065 points 5 and 6): connect, check the nodes, subscribe, and
// carry values until the session ends, then say why on the bus. Which endings are retried is
// the retry policy's decision.

export type ModuleSessionDependencies = {
  module: ModulePlan;
  pki: Pki;
  bus: Pick<BusClient, "write" | "plcStatus">;
  log: Logger;
  retry: RetryTimings;
  timers: Timers;
  /** A failure that ends the whole bridge (a server certificate, a login): the module stops. */
  onFatal(error: BridgeError): void;
  /** The core's latest value of each feedback tag, shared by the modules. */
  feedbackValues: ReadonlyMap<string, number>;
};

export type ModuleSession = {
  start(): void;
  /** Writes the module's feedback among `tags`, or all of it. Dropped until a session is open. */
  writeFeedback(tags: readonly string[] | "all"): void;
  stop(): Promise<void>;
};

// "fatal" is an ending the bridge as a whole reacts to; the module does not try again.
type SessionEnding = PlcModuleLossReason | "stopped";
type Ending = SessionEnding | "fatal";
type LossOrConnected = { connected: true } | { connected: false; reason: PlcModuleLossReason };

// Closing a session whose server went silent can wait for an answer that never comes: the
// ending is reported first, and the close gets this long.
const CLOSE_GRACE_MILLISECONDS = 1000;
const STOP_GRACE_MILLISECONDS = 3000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ModuleLife implements ModuleSession {
  private readonly stopSignal = deferred<"stopped">();
  private readonly lastCommandValues = new Map<string, number>();
  private stopped = false;
  private writeQueue: WriteQueue | null = null;
  private lastReported: string | null = null;
  private running: Promise<void> = Promise.resolve();
  private readonly dependencies: ModuleSessionDependencies;
  private readonly retryPolicy: RetryPolicy;

  constructor(dependencies: ModuleSessionDependencies) {
    this.dependencies = dependencies;
    this.retryPolicy = createRetryPolicy(dependencies.retry);
  }

  start(): void {
    this.running = this.runUntilStopped();
  }

  writeFeedback(tags: readonly string[] | "all"): void {
    this.writeQueue?.enqueue(tags);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopSignal.resolve("stopped");
    await this.within(STOP_GRACE_MILLISECONDS, this.running);
  }

  // Waits for `work`, but no longer than `milliseconds`.
  private async within(milliseconds: number, work: Promise<unknown>): Promise<void> {
    const { timers } = this.dependencies;
    const grace = deferred<void>();
    const handle = timers.set(() => grace.resolve(), milliseconds);
    await Promise.race([work, grace.promise]);
    timers.clear(handle);
  }

  private report(status: LossOrConnected): void {
    const key = status.connected ? "connected" : status.reason;
    if (key !== this.lastReported) {
      this.lastReported = key;
      this.dependencies.bus.plcStatus(this.dependencies.module.key, status);
    }
  }

  // Only changes against the PLC's last value go to the bus (ADR 0045 point 10).
  private forwardCommand(tag: string, value: number): void {
    if (this.lastCommandValues.get(tag) !== value) {
      this.lastCommandValues.set(tag, value);
      this.dependencies.bus.write(tag, value);
    }
  }

  private async runUntilStopped(): Promise<void> {
    while (!this.stopped) {
      const ending = await this.attempt();
      if (ending === "stopped" || ending === "fatal") {
        return;
      }
      await this.within(this.retryPolicy.delayAfter(ending), this.stopSignal.promise);
    }
  }

  // The PLC may have restarted: its commands are read again, and all of them go to the core.
  private async attempt(): Promise<Ending> {
    const { module, log, pki } = this.dependencies;
    this.lastCommandValues.clear();
    let connection: Connection;
    try {
      connection = await openConnection(module, pki, log);
    } catch (error) {
      return this.endAfterOpenFailure(error);
    }
    const ending = await this.carryOrFail(connection);
    this.writeQueue = null;
    if (ending !== "stopped") {
      this.report({ connected: false, reason: ending });
    }
    await this.within(CLOSE_GRACE_MILLISECONDS, connection.close());
    return ending;
  }

  private endAfterOpenFailure(error: unknown): Ending {
    const { module, log } = this.dependencies;
    if (error instanceof BridgeError) {
      log.error(error.message);
      this.dependencies.onFatal(error);
      return "fatal";
    }
    if (error instanceof ClientCertificateRefusedError) {
      log.error(`Module ${module.key}: ${error.message}`);
      this.report({ connected: false, reason: "certificate_rejected" });
      return "certificate_rejected";
    }
    log.error(
      `Module ${module.key}: cannot open a session to ${module.endpoint}: ${describe(error)}`,
    );
    this.report({ connected: false, reason: "closed" });
    return "closed";
  }

  private async carryOrFail(connection: Connection): Promise<SessionEnding> {
    if (this.stopped) {
      return "stopped";
    }
    try {
      return await this.carry(connection);
    } catch (error) {
      this.dependencies.log.error(
        `Module ${this.dependencies.module.key}: the session failed: ${describe(error)}`,
      );
      return "closed";
    }
  }

  // Connected means: session open, nodes checked, subscription and its items made, first publish
  // received. The server is a PLC that may go silent at any step, so the steps that wait for
  // it give way to the loss of the session and to the stop signal.
  private async carry(connection: Connection): Promise<SessionEnding> {
    const { module, log } = this.dependencies;
    const interrupted = Promise.race([
      connection.lost.then((): SessionEnding => "closed"),
      this.stopSignal.promise,
    ]);
    const prepared = await unlessInterrupted(
      prepareNodes(connection.session, module, log),
      interrupted,
    );
    if ("ending" in prepared) {
      return prepared.ending;
    }
    if (!prepared.value.ok) {
      return "node_mismatch";
    }
    const nodes = prepared.value.nodes;
    this.writeQueue = new WriteQueue(connection, nodes, this.dependencies);
    this.writeQueue.enqueue("all");
    return this.monitorUntilEnd(connection, nodes, interrupted);
  }

  private async monitorUntilEnd(
    connection: Connection,
    nodes: PreparedNodes,
    interrupted: Promise<SessionEnding>,
  ): Promise<SessionEnding> {
    const { module, log, timers } = this.dependencies;
    const firstPublish = deferred<"published">();
    const silence = deferred<"timeout">();
    let feedWatchdog = (): void => undefined;
    const monitoring = await unlessInterrupted(
      startMonitoring(connection.session, nodes.commands, module.transport, {
        onPublish: () => {
          feedWatchdog();
          firstPublish.resolve("published");
        },
        onCommandValue: (tag, value) => this.forwardCommand(tag, value),
      }),
      interrupted,
    );
    if ("ending" in monitoring) {
      return monitoring.ending;
    }
    if (monitoring.value.length > 0) {
      for (const { command, status } of monitoring.value) {
        log.error(
          `Module ${module.key}: the server refused to monitor ${command.nodeId} (tag ${command.tag}): ${status}.`,
        );
      }
      return "node_mismatch";
    }
    const watchdog = startWatchdog(
      module.transport.watchdogMilliseconds,
      () => silence.resolve("timeout"),
      timers,
    );
    feedWatchdog = watchdog.feed;
    try {
      const ending = Promise.race([interrupted, silence.promise]);
      const first = await Promise.race([firstPublish.promise, ending]);
      if (first !== "published") {
        return first;
      }
      this.report({ connected: true });
      this.retryPolicy.sessionWasHealthy();
      return await ending;
    } finally {
      watchdog.stop();
    }
  }
}

/** The result of `work`, or the ending that came first. `work` is left to finish on its own. */
function unlessInterrupted<T>(
  work: Promise<T>,
  interrupted: Promise<SessionEnding>,
): Promise<{ value: T } | { ending: SessionEnding }> {
  return Promise.race([
    work.then((value) => ({ value })),
    interrupted.then((ending) => ({ ending })),
  ]);
}

export function createModuleSession(dependencies: ModuleSessionDependencies): ModuleSession {
  return new ModuleLife(dependencies);
}
