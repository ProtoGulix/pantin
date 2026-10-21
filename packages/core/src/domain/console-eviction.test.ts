import type { ConsoleEvent } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  appendConsoleEvent,
  CONSOLE_CAPACITY,
  type ConsoleBuffer,
  emptyConsole,
  readConsoleAfter,
} from "./console-buffer.ts";

const STAMP = { wallTime: "2026-10-01T10:00:00.000Z", simulationTime: 1 };

function trace(index: number): ConsoleEvent {
  return {
    code: "sensor_changed",
    level: "trace",
    source: { kind: "sensor", id: `s${index % 2}` },
    params: { tag: `main.s${index}.state`, value: 1 },
  };
}

const ERROR: ConsoleEvent = {
  code: "step_error",
  level: "error",
  source: { kind: "pantin" },
  params: { detail: "boom" },
};

function fill(events: readonly ConsoleEvent[]): ConsoleBuffer {
  return events.reduce(
    (buffer, event) => appendConsoleEvent(buffer, event, STAMP),
    emptyConsole("console-1"),
  );
}

describe("console eviction (ADR 0061 point 5)", () => {
  it("drops the oldest trace entry before an older error", () => {
    const events = [ERROR, ...Array.from({ length: CONSOLE_CAPACITY - 1 }, (_, i) => trace(i))];
    const full = fill(events);
    expect(full.entries).toHaveLength(CONSOLE_CAPACITY);
    const next = appendConsoleEvent(full, trace(5000), STAMP);
    expect(next.entries).toHaveLength(CONSOLE_CAPACITY);
    expect(next.entries[0]?.code).toBe("step_error");
    expect(next.entries[1]?.params).toEqual({ tag: "main.s1.state", value: 1 });
    expect(next.entries.at(-1)?.params).toEqual({ tag: "main.s5000.state", value: 1 });
  });

  it("drops the oldest entry when no trace entry is left", () => {
    const full = fill(
      Array.from({ length: CONSOLE_CAPACITY }, (_, i) => ({
        ...ERROR,
        params: { detail: `boom ${i}` },
      })),
    );
    const next = appendConsoleEvent(full, ERROR, STAMP);
    expect(next.entries[0]?.params).toEqual({ detail: "boom 1" });
  });

  it("keeps the error through a flood of trace entries", () => {
    const flood = Array.from({ length: CONSOLE_CAPACITY * 2 }, (_, i) => trace(i));
    const buffer = fill([ERROR, ...flood]);
    expect(buffer.entries.filter((entry) => entry.level === "error")).toHaveLength(1);
  });

  it("answers with the verbose flag it is given", () => {
    expect(readConsoleAfter(emptyConsole("c"), 0, true).verbose).toBe(true);
  });
});
