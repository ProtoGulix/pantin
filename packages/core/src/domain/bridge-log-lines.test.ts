import { describe, expect, it } from "vitest";
import {
  classifyBridgeLine,
  consoleMessageOfBridgeLine,
  describeBridgeTransition,
  describePlcLinkEvent,
  formatBridgeLogLine,
  formatCoreLogLine,
  shouldReachConsole,
} from "./bridge-log-lines.ts";

const TIME = new Date("2026-10-17T10:11:12.345Z");

describe("classifyBridgeLine", () => {
  it.each([
    ["2026-10-17 10:11:12,345 WARNING pantin_bridge.x: refused", "warning"],
    ["2026-10-17T10:11:12.345Z ERROR something", "error"],
    ["2026-10-17 10:11:12,345 CRITICAL boom", "error"],
    ["WARNING no timestamp", "warning"],
    ["2026-10-17 10:11:12,345 INFO started", "info"],
    ["2026-10-17 10:11:12,345 DEBUG detail", "debug"],
    ["Traceback (most recent call last):", "info"],
    ["  File x.py, line 3, in WARNINGS", "info"],
    ["WARNINGS are not a level", "info"],
  ])("%s -> %s", (line, level) => {
    expect(classifyBridgeLine(line)).toBe(level);
  });

  it("sends only warnings and errors to the console", () => {
    expect(
      ["debug", "info", "warning", "error"].map((l) => shouldReachConsole(l as never)),
    ).toEqual([false, false, true, true]);
  });
});

describe("consoleMessageOfBridgeLine", () => {
  it("drops the timestamp, the level and the logger name, and cuts to 300 characters", () => {
    expect(
      consoleMessageOfBridgeLine(
        "2026-10-17 10:11:12,345 WARNING pantin_bridge.m: Module m1 refused",
      ),
    ).toBe("Module m1 refused");
    expect(consoleMessageOfBridgeLine(`ERROR ${"x".repeat(400)}`)).toHaveLength(300);
    expect(consoleMessageOfBridgeLine("plain line")).toBe("plain line");
  });

  it("keeps a leading word with a colon when the line has no Python timestamp", () => {
    expect(consoleMessageOfBridgeLine("WARNING Refused: unit 2")).toBe("Refused: unit 2");
  });
});

describe("log file lines", () => {
  it("prefixes a core event and a bridge line with the ISO UTC time", () => {
    expect(formatCoreLogLine(TIME, "info", "Stop requested.")).toBe(
      "2026-10-17T10:11:12.345Z CORE INFO Stop requested.",
    );
    expect(formatBridgeLogLine(TIME, "2026-10-17 10:11:12,345 WARNING x")).toBe(
      "2026-10-17T10:11:12.345Z BRIDGE 2026-10-17 10:11:12,345 WARNING x",
    );
  });

  it("cuts a line to 500 characters", () => {
    expect(formatBridgeLogLine(TIME, "y".repeat(900))).toHaveLength(500);
  });
});

describe("describeBridgeTransition", () => {
  const network = { listen: "192.168.1.20", allow: ["192.168.1.0/24"] };
  const failure = {
    kind: "crashed",
    message: "gone",
    exitCode: 1,
    signal: null,
    certificate: null,
    module: null,
  } as const;

  it("says what was asked and what happened", () => {
    expect(
      describeBridgeTransition(
        { phase: "stopped" },
        { phase: "starting" },
        { type: "start_requested" },
        network,
      ),
    ).toEqual({
      level: "info",
      text: "Start requested: listen 192.168.1.20, allow 192.168.1.0/24.",
    });
    expect(
      describeBridgeTransition(
        { phase: "starting" },
        { phase: "running", modules: [{ key: "m1", endpoint: "192.168.1.20:1502" }] },
        { type: "ready", modules: [{ key: "m1", endpoint: "192.168.1.20:1502" }] },
        network,
      )?.text,
    ).toBe("Bridge ready: modules m1 at 192.168.1.20:1502.");
    expect(
      describeBridgeTransition(
        { phase: "running", modules: [] },
        { phase: "stopping" },
        { type: "stop_requested" },
        network,
      )?.text,
    ).toBe("Stop requested.");
    expect(
      describeBridgeTransition(
        { phase: "stopping" },
        { phase: "stopped" },
        { type: "exited", exitCode: 0, signal: null, exiting: undefined },
        network,
      )?.text,
    ).toBe("Bridge stopped.");
  });

  it("lists the targets of an OPC UA start, and says nothing of a password", () => {
    const targets = { plc: "192.168.1.30", spare: "127.0.0.1" };
    expect(
      describeBridgeTransition(
        { phase: "stopped" },
        { phase: "starting" },
        { type: "start_requested" },
        { targets },
      )?.text,
    ).toBe("Start requested: targets plc=192.168.1.30, spare=127.0.0.1.");
  });

  it("reports a failure once, as an error with its kind", () => {
    const event = { type: "exited", exitCode: 1, signal: null, exiting: undefined } as const;
    expect(
      describeBridgeTransition(
        { phase: "running", modules: [] },
        { phase: "failed", failure },
        event,
        network,
      ),
    ).toEqual({ level: "error", text: "Bridge failed (crashed): gone" });
    expect(
      describeBridgeTransition(
        { phase: "failed", failure },
        { phase: "failed", failure },
        event,
        network,
      ),
    ).toBeUndefined();
  });
});

describe("describePlcLinkEvent", () => {
  const source = { kind: "pantin" } as const;

  it("writes a forced tag write ignored as an error line with both values", () => {
    expect(
      describePlcLinkEvent({
        code: "forced_tag_written",
        level: "error",
        source,
        params: { tag: "verin1.verin1.coil_14", forcedValue: 0, writtenValue: 1 },
      }),
    ).toEqual({
      level: "error",
      text: "PLC write ignored on forced tag verin1.verin1.coil_14 (forced 0, PLC wrote 1).",
    });
  });

  it("keeps the level of the PLC connection events", () => {
    expect(
      describePlcLinkEvent({
        code: "plc_connected",
        level: "info",
        source,
        params: { module: "m1" },
      }),
    ).toEqual({ level: "info", text: "PLC connected to module m1." });
    expect(
      describePlcLinkEvent({
        code: "plc_disconnected",
        level: "warning",
        source,
        params: { module: "m1", reason: "timeout" },
      }),
    ).toEqual({
      level: "warning",
      text: "PLC disconnected from module m1: no request within its watchdog time.",
    });
  });
});

describe("describePlcLinkEvent, events it leaves out", () => {
  const source = { kind: "pantin" } as const;

  it("says nothing of bridge_log (it would loop) or bridge_failed (the supervisor logs it)", () => {
    expect(
      describePlcLinkEvent({
        code: "bridge_log",
        level: "warning",
        source,
        params: { message: "x" },
      }),
    ).toBeUndefined();
    expect(
      describePlcLinkEvent({
        code: "bridge_failed",
        level: "error",
        source,
        params: { kind: "crashed", message: "x" },
      }),
    ).toBeUndefined();
  });
});
