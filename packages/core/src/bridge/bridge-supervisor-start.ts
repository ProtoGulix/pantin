import {
  type BridgeStatus,
  type IoMappingResponse,
  OPCUA_CLIENT_KIND,
  type PantinId,
  type TransportKind,
} from "@pantin/protocol";
import { TRANSPORT_LABELS } from "@pantin/transport-types/labels";
import { TRANSPORT_RULES } from "@pantin/transport-types/rules";
import { type BridgeStartFacts, claimedPorts } from "../domain/bridge-checks.ts";
import {
  type BridgePlan,
  type BridgeStartRequest,
  LAUNCHER_ADVICE,
  planBridgeStart,
  readyModulesOf,
} from "../domain/bridge-kinds.ts";
import { appendLogLine, commonBridgeArguments, truncateLogLine } from "../domain/bridge-output.ts";
import { describeIoProblem } from "../domain/io-problem-text.ts";
import { ApiError } from "../errors.ts";
import type { Entry } from "./bridge-entry.ts";
import { type BridgeProcessHandlers, startBridgeProcess } from "./bridge-process.ts";
import {
  activeClaims,
  type BridgeLauncher,
  type Context,
  dispatch,
  entryForStart,
  launcherOf,
  refresh,
  sinksOf,
  statusOf,
} from "./bridge-supervisor-context.ts";
import { logBridgeLine } from "./bridge-supervisor-log.ts";

// Starting a bridge: the checks, then the child and what its output means (ADR 0050).

const FIRST_PROBLEMS = 3;

// Events of a child that a newer start replaced are not this entry's business.
function handlersFor(context: Context, entry: Entry, generation: number): BridgeProcessHandlers {
  const current = (action: () => void): void => {
    if (entry.generation === generation) {
      action();
    }
  };
  return {
    onStatusLine: (line) =>
      current(() => {
        if (line.event === "ready") {
          if (line.transport === OPCUA_CLIENT_KIND) {
            entry.clientCertificate = line.clientCertificate;
          }
          dispatch(context, entry, { type: "ready", modules: readyModulesOf(line) });
        } else {
          entry.exiting = line;
        }
      }),
    onLogLine: (line) =>
      current(() => {
        entry.log = appendLogLine(entry.log, line);
        context.options.mirrorLogLine(entry.pantinId, truncateLogLine(line));
        logBridgeLine(sinksOf(context), entry, line);
        refresh(context, entry.pantinId);
      }),
    onSpawnError: (error) =>
      current(() => {
        entry.process = undefined;
        const message = `Cannot run the ${entry.kind} bridge (${error.message}). ${LAUNCHER_ADVICE[entry.kind].failed}`;
        dispatch(context, entry, { type: "spawn_failed", message });
      }),
    onExit: ({ exitCode, signal }) =>
      current(() => {
        entry.process = undefined;
        const exiting = entry.exiting;
        // A refused login would be refused again with the same password: ask for it anew.
        if (exiting?.kind === "authentication_failed" && exiting.module !== null) {
          context.passwords.forget(entry.pantinId, exiting.module);
        }
        dispatch(context, entry, { type: "exited", exitCode, signal, exiting });
      }),
  };
}

function spawnFor(
  context: Context,
  entry: Entry,
  launcher: BridgeLauncher,
  plan: BridgePlan,
): void {
  const { options } = context;
  entry.generation += 1;
  const generation = entry.generation;
  const args = [
    ...launcher.args,
    ...commonBridgeArguments({ core: options.coreAddress(), pantinId: entry.pantinId }),
    ...(launcher.hostArguments ?? []),
    ...plan.kindArguments,
  ];
  const program = {
    command: launcher.command,
    args,
    environment: launcher.environment,
    stdinLine: plan.passwords === null ? null : JSON.stringify({ passwords: plan.passwords }),
  };
  const handle = startBridgeProcess(
    options.spawn,
    program,
    options.killGraceMs,
    handlersFor(context, entry, generation),
  );
  entry.process = handle;
  context.liveProcesses.add(handle.exited);
  void handle.exited.then(() => context.liveProcesses.delete(handle.exited));
  if (entry.state.phase !== "starting") {
    return; // The program could not even be run: nothing to wait for.
  }
  entry.startTimer = setTimeout(() => {
    if (entry.generation === generation) {
      dispatch(context, entry, { type: "start_timed_out" });
      handle.stop();
    }
  }, options.startTimeoutMs);
  entry.startTimer.unref();
}

function refuseWhenClosed(context: Context): void {
  if (context.closed) {
    throw new ApiError("conflict", "The core is shutting down: the bridge is not started.");
  }
}

// What a checked start leaves behind besides the child: the passwords the next start may
// omit, and the console warning of an unsecured connection.
function rememberOutcome(
  context: Context,
  pantinId: PantinId,
  request: BridgeStartRequest,
  plan: BridgePlan,
): void {
  const { options } = context;
  if (plan.passwords !== null && request.kind === OPCUA_CLIENT_KIND) {
    context.passwords.replace(pantinId, plan.passwords, request.targets);
  }
  if (plan.unsecuredLanModules.length > 0) {
    options.service
      .recordOpcuaUnsecuredLan(pantinId, plan.unsecuredLanModules)
      .catch(options.reportError);
  }
}

// Everything the checks judge a start on, read at the moment of the start.
function startFactsOf(
  context: Context,
  pantinId: PantinId,
  kind: TransportKind,
  mapping: IoMappingResponse,
): BridgeStartFacts {
  const { options } = context;
  const modules = TRANSPORT_RULES[kind].bridgeModules(mapping.modules);
  const moduleKeys = new Set(modules.map(({ key }) => key));
  return {
    kind,
    transportName: TRANSPORT_LABELS[kind].en.name,
    hostAddresses: options.hostAddresses(),
    mapping: {
      status: mapping.status,
      modules,
      problems: mapping.problems.slice(0, FIRST_PROBLEMS).map(describeIoProblem),
    },
    externalBridgeConnected: statusOf(context, pantinId, kind).externalBridgeConnected,
    core: options.coreAddress(),
    activeBridges: activeClaims(context),
    moduleTransports: mapping.modules.filter(({ key }) => moduleKeys.has(key)),
    storedPasswords: context.passwords.of(pantinId),
  };
}

export async function startBridge(
  context: Context,
  pantinId: PantinId,
  request: BridgeStartRequest,
): Promise<BridgeStatus> {
  const { kind } = request;
  const launcher = launcherOf(context, kind);
  if (launcher === undefined) {
    throw new ApiError(
      "bridge_unavailable",
      `The ${TRANSPORT_LABELS[kind].en.name} bridge is not configured: ${LAUNCHER_ADVICE[kind].missing}.`,
    );
  }
  refuseWhenClosed(context);
  // The kind's projection: an invalid module of another kind must not block this start
  // (ADR 0065 point 7).
  const mapping = await context.options.service.readIo(pantinId, kind);
  refuseWhenClosed(context);
  if (request.kind === OPCUA_CLIENT_KIND) {
    // Before the checks, so that a refused start forgets them too.
    context.passwords.forgetChangedTargets(pantinId, request.targets);
  }
  const facts = startFactsOf(context, pantinId, kind, mapping);
  const result = planBridgeStart(pantinId, request, facts);
  if (!result.ok) {
    throw new ApiError(result.refusal.code, result.refusal.message, result.refusal.httpStatus);
  }
  const { plan } = result;
  rememberOutcome(context, pantinId, request, plan);
  const entry = entryForStart(context, pantinId, kind);
  Object.assign(entry, {
    network: plan.network,
    listen: plan.listen,
    ports: claimedPorts(TRANSPORT_RULES[kind].network, facts.mapping.modules),
    log: [],
    exiting: undefined,
  });
  dispatch(context, entry, { type: "start_requested" });
  spawnFor(context, entry, launcher, plan);
  return statusOf(context, pantinId, kind);
}
