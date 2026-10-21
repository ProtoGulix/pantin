import { describe, expect, it } from "vitest";
import {
  type BridgeEvent,
  type BridgeMachineState,
  failureOfExit,
  INITIAL_BRIDGE_STATE,
  nextBridgeState,
} from "./bridge-state.ts";

const MODULES = [{ key: "m1", endpoint: "127.0.0.1:1502" }];
const CRASH_FAILURE = {
  kind: "crashed",
  message: "The bridge stopped without saying why (exit code 1). See the bridge log.",
  exitCode: 1,
  signal: null,
  certificate: null,
  module: null,
} as const;

const STATES: Record<string, BridgeMachineState> = {
  stopped: { phase: "stopped" },
  starting: { phase: "starting" },
  running: { phase: "running", modules: MODULES },
  stopping: { phase: "stopping" },
  failed: { phase: "failed", failure: CRASH_FAILURE },
};

const EXITED_QUIETLY: BridgeEvent = {
  type: "exited",
  exitCode: 1,
  signal: null,
  exiting: undefined,
};

const EVENTS: Record<string, BridgeEvent> = {
  start_requested: { type: "start_requested" },
  ready: { type: "ready", modules: MODULES },
  exited: EXITED_QUIETLY,
  spawn_failed: { type: "spawn_failed", message: "ENOENT" },
  start_timed_out: { type: "start_timed_out" },
  stop_requested: { type: "stop_requested" },
};

const SPAWN_FAILURE = {
  kind: "spawn_failed",
  message: "ENOENT",
  exitCode: null,
  signal: null,
  certificate: null,
  module: null,
} as const;
const TIMEOUT_FAILURE = {
  kind: "start_timeout",
  message: "The bridge did not report ready in time. See the bridge log.",
  exitCode: null,
  signal: null,
  certificate: null,
  module: null,
} as const;

// Every (state, event) pair; a pair that is not in the ADR 0050 table keeps the state.
const EXPECTED: Record<string, Record<string, BridgeMachineState>> = {
  stopped: { start_requested: { phase: "starting" } },
  failed: { start_requested: { phase: "starting" } },
  starting: {
    ready: { phase: "running", modules: MODULES },
    exited: { phase: "failed", failure: CRASH_FAILURE },
    spawn_failed: { phase: "failed", failure: SPAWN_FAILURE },
    start_timed_out: { phase: "failed", failure: TIMEOUT_FAILURE },
    stop_requested: { phase: "stopping" },
  },
  running: {
    exited: { phase: "failed", failure: CRASH_FAILURE },
    stop_requested: { phase: "stopping" },
  },
  stopping: {
    exited: { phase: "stopped" },
    spawn_failed: { phase: "stopped" },
  },
};

describe("nextBridgeState", () => {
  const cases = Object.keys(STATES).flatMap((stateName) =>
    Object.keys(EVENTS).map((eventName) => [stateName, eventName] as const),
  );

  it.each(cases)("%s + %s", (stateName, eventName) => {
    const state = STATES[stateName];
    const event = EVENTS[eventName];
    if (state === undefined || event === undefined) {
      throw new Error("Unknown case.");
    }
    const expected = EXPECTED[stateName]?.[eventName] ?? state;
    expect(nextBridgeState(state, event)).toEqual(expected);
  });

  it("starts stopped", () => {
    expect(INITIAL_BRIDGE_STATE).toEqual({ phase: "stopped" });
  });

  it.each([
    ["an exit code", 0, null],
    ["a non-zero exit code", 1, null],
    ["SIGKILL", null, "SIGKILL"],
  ])("a requested stop ends in stopped whatever the child's end: %s", (_name, exitCode, signal) => {
    const exited: BridgeEvent = { type: "exited", exitCode, signal, exiting: undefined };
    expect(nextBridgeState({ phase: "stopping" }, exited)).toEqual({ phase: "stopped" });
  });

  it("keeps the failure of a bridge that said why it left", () => {
    const exited: BridgeEvent = {
      type: "exited",
      exitCode: 1,
      signal: null,
      exiting: {
        event: "exiting",
        kind: "mapping_changed",
        message: "Restart.",
        certificate: null,
        module: null,
      },
    };
    expect(nextBridgeState({ phase: "running", modules: MODULES }, exited)).toEqual({
      phase: "failed",
      failure: {
        kind: "mapping_changed",
        message: "Restart.",
        exitCode: 1,
        signal: null,
        certificate: null,
        module: null,
      },
    });
  });

  it("carries the server certificate and the module of a bridge that named them", () => {
    const certificate = {
      subject: "CN=PLC",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2036-01-01T00:00:00.000Z",
      sha256: "a".repeat(64),
      sha1: "b".repeat(40),
      reason: "Not trusted yet",
    };
    const failure = failureOfExit({
      type: "exited",
      exitCode: 1,
      signal: null,
      exiting: {
        event: "exiting",
        kind: "untrusted_server_certificate",
        message: "Trust it?",
        certificate,
        module: "plc",
      },
    });
    expect(failure).toMatchObject({
      kind: "untrusted_server_certificate",
      certificate,
      module: "plc",
    });
  });
});

describe("failureOfExit", () => {
  it("names the signal of a child that was killed", () => {
    const failure = failureOfExit({
      type: "exited",
      exitCode: null,
      signal: "SIGKILL",
      exiting: undefined,
    });
    expect(failure.kind).toBe("crashed");
    expect(failure.message).toContain("signal SIGKILL");
    expect(failure.signal).toBe("SIGKILL");
  });
});
