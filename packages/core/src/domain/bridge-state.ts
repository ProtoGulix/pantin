import type { BridgeFailure, BridgeStatusLine } from "@pantin/protocol";

// The state of one supervised PLC bridge (ADR 0050 point 3), as a pure
// function from state and event to state. The process adapter turns what
// happens to the child into events; nothing here touches a process or a clock.

// A module the bridge serves: where the PLC connects (Modbus) or where Pantin connects (OPC UA).
export type BridgeReadyModule = { key: string; endpoint: string };

export type BridgeMachineState =
  | { phase: "stopped" }
  | { phase: "starting" }
  | { phase: "running"; modules: readonly BridgeReadyModule[] }
  | { phase: "stopping" }
  | { phase: "failed"; failure: BridgeFailure };

export type BridgeExitingLine = Extract<BridgeStatusLine, { event: "exiting" }>;

// A failure the core found itself: no server certificate and no module to name.
function coreFailure(kind: BridgeFailure["kind"], message: string): BridgeFailure {
  return { kind, message, exitCode: null, signal: null, certificate: null, module: null };
}

export type BridgeEvent =
  | { type: "start_requested" }
  | { type: "ready"; modules: readonly BridgeReadyModule[] }
  // `exiting` is the last `exiting` line the child wrote, if any.
  | {
      type: "exited";
      exitCode: number | null;
      signal: string | null;
      exiting: BridgeExitingLine | undefined;
    }
  | { type: "spawn_failed"; message: string }
  | { type: "start_timed_out" }
  | { type: "stop_requested" };

export const INITIAL_BRIDGE_STATE: BridgeMachineState = { phase: "stopped" };

function describeExit(exitCode: number | null, signal: string | null): string {
  return signal === null ? `exit code ${String(exitCode)}` : `signal ${signal}`;
}

// A child that wrote no `exiting` line did not choose to stop: a traceback, a
// kill, or a bug.
export function failureOfExit(event: Extract<BridgeEvent, { type: "exited" }>): BridgeFailure {
  const { exitCode, signal, exiting } = event;
  if (exiting !== undefined) {
    return {
      kind: exiting.kind,
      message: exiting.message,
      exitCode,
      signal,
      certificate: exiting.certificate,
      module: exiting.module,
    };
  }
  return {
    ...coreFailure(
      "crashed",
      `The bridge stopped without saying why (${describeExit(exitCode, signal)}). See the bridge log.`,
    ),
    exitCode,
    signal,
  };
}

function failed(failure: BridgeFailure): BridgeMachineState {
  return { phase: "failed", failure };
}

// An event that makes no sense in the current state (a late `ready` after a
// stop, a second exit) changes nothing: the child reports in its own time.
export function nextBridgeState(state: BridgeMachineState, event: BridgeEvent): BridgeMachineState {
  switch (event.type) {
    case "start_requested":
      return state.phase === "stopped" || state.phase === "failed" ? { phase: "starting" } : state;
    case "ready":
      return state.phase === "starting" ? { phase: "running", modules: event.modules } : state;
    case "exited":
      return exitedState(state, event);
    case "spawn_failed":
      return spawnFailedState(state, event.message);
    case "start_timed_out":
      return state.phase === "starting"
        ? failed(
            coreFailure(
              "start_timeout",
              "The bridge did not report ready in time. See the bridge log.",
            ),
          )
        : state;
    case "stop_requested":
      return state.phase === "starting" || state.phase === "running"
        ? { phase: "stopping" }
        : state;
  }
}

// Whatever the exit code or signal, a requested stop ends in `stopped`: the
// core's own SIGKILL after the grace delay is not a failure.
function exitedState(
  state: BridgeMachineState,
  event: Extract<BridgeEvent, { type: "exited" }>,
): BridgeMachineState {
  if (state.phase === "stopping") {
    return { phase: "stopped" };
  }
  return state.phase === "starting" || state.phase === "running"
    ? failed(failureOfExit(event))
    : state;
}

function spawnFailedState(state: BridgeMachineState, message: string): BridgeMachineState {
  if (state.phase === "stopping") {
    return { phase: "stopped" };
  }
  return state.phase === "starting" ? failed(coreFailure("spawn_failed", message)) : state;
}
