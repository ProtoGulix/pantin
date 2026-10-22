import { type BridgeArguments, parseArguments } from "./arguments.ts";
import { serve } from "./bridge.ts";
import { type BusClient, openBus } from "./bus-client.ts";
import { busUrlOf, type Fetcher, fetchProjection } from "./core-endpoint.ts";
import { BridgeError, ConfigurationError } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { type BridgePlan, planModules } from "./module-plan.ts";
import { type Pki, type PkiFileSystem, preparePki } from "./opcua/pki.ts";
import { createModuleSessions, redirectLibraryLogging } from "./opcua/session.ts";
import { trustRequested } from "./opcua/trust.ts";
import { createStatusLines, type StatusLines } from "./status-lines.ts";
import { type PasswordInput, readPasswords } from "./stdin-passwords.ts";
import type { StatusLineWriter } from "./stdout-guard.ts";

// The bridge's start-up order (ADR 0065 point 5): command line, passwords, PKI, the core's
// projection, the bus `welcome`, then `ready`, without waiting for any PLC.

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_BAD_CONFIGURATION = 2;

/** Every effect of the bridge, given by main.ts; tests give fakes. */
export type RunEnvironment = {
  argv: readonly string[];
  stdin: PasswordInput;
  fetcher: Fetcher;
  hostname: string;
  platform: NodeJS.Platform;
  fileSystem: PkiFileSystem;
  writeStatusLine: StatusLineWriter;
  log: Logger;
  /** Settles on SIGTERM. */
  terminated: Promise<void>;
};

/** A SIGTERM arrived before the bridge was serving: a clean stop, not a failure. */
class TerminatedBeforeServing extends Error {}

// Every step before `serve` waits on something outside (stdin, the file system, the core), and
// the contract of ADR 0065 point 5 is that SIGTERM ends the bridge promptly, with code 0 and no
// exiting line, at any moment. The abandoned step is left to the process exit that follows.
function unlessTerminated<T>(work: Promise<T>, terminated: Promise<void>): Promise<T> {
  return Promise.race([
    work,
    terminated.then((): never => {
      throw new TerminatedBeforeServing();
    }),
  ]);
}

async function startAndServe(
  environment: RunEnvironment,
  statusLines: StatusLines,
  args: BridgeArguments,
): Promise<void> {
  const interruptible = <T>(work: Promise<T>): Promise<T> =>
    unlessTerminated(work, environment.terminated);
  const passwords = await interruptible(readPasswords(environment.stdin, args.statusLines));
  redirectLibraryLogging(environment.log);
  const pki = await interruptible(
    preparePki({
      directory: args.pkiDirectory,
      hostname: environment.hostname,
      platform: environment.platform,
      fileSystem: environment.fileSystem,
    }),
  );
  const projection = await interruptible(fetchProjection(environment.fetcher, args.core));
  const plan = planModules({
    projection,
    targets: args.targets,
    passwords,
    startedByCore: args.statusLines,
  });
  const bus = await interruptible(openBus(busUrlOf(args.core), plan.mappingId));
  try {
    await serveOnBus({ environment, statusLines, args, plan, pki, bus });
  } finally {
    await bus.close();
  }
}

async function serveOnBus(options: {
  environment: RunEnvironment;
  statusLines: StatusLines;
  args: BridgeArguments;
  plan: BridgePlan;
  pki: Pki;
  bus: BusClient;
}): Promise<void> {
  const { environment, plan, pki, bus } = options;
  // Feedback is what the core sends to the PLC; commands travel the other way.
  bus.subscribe(
    plan.modules.flatMap((module) =>
      module.signals.filter((signal) => signal.direction === "feedback").map((s) => s.tag),
    ),
  );
  const sessions = createModuleSessions({
    modules: plan.modules,
    pki,
    bus,
    log: environment.log,
  });
  try {
    await trustRequested(pki, options.args.trust, environment.fileSystem, environment.log);
    sessions.start();
    await options.statusLines.ready(
      plan.modules.map(({ key, endpoint }) => ({ key, endpoint })),
      pki.clientCertificate,
    );
    environment.log.info(`Bridge ready: ${plan.modules.length} OPC UA module(s).`);
    await serve({ bus, sessions, log: environment.log, terminated: environment.terminated });
  } finally {
    await sessions.stop();
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof BridgeError) {
    return error.message;
  }
  return `Unexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
}

/** Runs the bridge to its end and returns the process exit code. */
export async function runBridge(environment: RunEnvironment): Promise<number> {
  // A bad command line must still reach a supervisor that asked for status lines.
  const statusLines = createStatusLines(
    environment.argv.includes("--status-lines") ? environment.writeStatusLine : null,
  );
  try {
    await startAndServe(environment, statusLines, parseArguments(environment.argv));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof TerminatedBeforeServing) {
      return EXIT_OK;
    }
    environment.log.error(describeFailure(error));
    await statusLines.exiting(error).catch((writeError: unknown) => {
      environment.log.warning(`Cannot write the exiting line: ${describeFailure(writeError)}`);
    });
    return error instanceof ConfigurationError ? EXIT_BAD_CONFIGURATION : EXIT_FAILURE;
  }
}
