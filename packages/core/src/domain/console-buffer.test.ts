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
const LATER = { wallTime: "2026-10-01T10:00:05.000Z", simulationTime: 6 };

function migrated(from: number): ConsoleEvent {
  return {
    code: "migrated",
    level: "info",
    source: { kind: "pantin" },
    params: { from, to: 9 },
  };
}

function appendAll(events: readonly ConsoleEvent[]): ConsoleBuffer {
  return events.reduce(
    (buffer, event) => appendConsoleEvent(buffer, event, STAMP),
    emptyConsole("console-1"),
  );
}

describe("the console buffer", () => {
  it("numbers entries from 1, oldest first", () => {
    const buffer = appendAll([migrated(1), migrated(2)]);
    expect(buffer.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(buffer.lastSequence).toBe(2);
  });

  it("keeps the last 1000 entries while the sequence keeps growing", () => {
    const events = Array.from({ length: CONSOLE_CAPACITY + 5 }, (_, index) => migrated(index + 1));
    const buffer = appendAll(events);
    expect(buffer.entries).toHaveLength(CONSOLE_CAPACITY);
    expect(buffer.entries[0]?.sequence).toBe(6);
    expect(buffer.lastSequence).toBe(CONSOLE_CAPACITY + 5);
  });

  it("does not modify the buffer it is given", () => {
    const before = appendAll([migrated(1)]);
    appendConsoleEvent(before, migrated(2), STAMP);
    appendConsoleEvent(before, migrated(1), STAMP);
    expect(before.entries).toHaveLength(1);
    expect(before.entries[0]?.count).toBe(1);
  });
});

describe("folding in the console buffer", () => {
  it("folds an identical event into the last entry: count, latest times, new sequence", () => {
    const first = appendAll([migrated(1)]);
    const folded = appendConsoleEvent(first, migrated(1), LATER);
    expect(folded.entries).toHaveLength(1);
    expect(folded.entries[0]).toMatchObject({
      ...LATER,
      count: 2,
      sequence: 2,
      firstSequence: 1,
    });
    expect(folded.lastSequence).toBe(2);
  });

  it("does not fold when the params, the code or the source differ", () => {
    const buffer = appendAll([
      migrated(1),
      migrated(2),
      {
        code: "fault_set",
        level: "info",
        source: { kind: "joint", id: "stroke" },
        params: { fault: "jammed" },
      },
      {
        code: "fault_set",
        level: "info",
        source: { kind: "drive", id: "stroke" },
        params: { fault: "jammed" },
      },
      {
        code: "fault_cleared",
        level: "info",
        source: { kind: "drive", id: "stroke" },
        params: { fault: "jammed" },
      },
    ]);
    expect(buffer.entries.map((entry) => entry.count)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("folding alternations in the console buffer", () => {
  it("folds an alternation of one source into two entries, newest last", () => {
    const toggle = (code: "fault_set" | "fault_cleared"): ConsoleEvent => ({
      code,
      level: "info",
      source: { kind: "drive", id: "valve" },
      params: { fault: "unresponsive" },
    });
    const buffer = appendAll([
      toggle("fault_set"),
      toggle("fault_cleared"),
      toggle("fault_set"),
      toggle("fault_cleared"),
      toggle("fault_set"),
    ]);
    expect(buffer.entries.map((entry) => [entry.code, entry.count, entry.sequence])).toEqual([
      ["fault_cleared", 2, 4],
      ["fault_set", 3, 5],
    ]);
    expect(buffer.entries.map((entry) => entry.firstSequence)).toEqual([2, 1]);
  });

  it("stops folding at an entry from another source", () => {
    const event = (id: string): ConsoleEvent => ({
      code: "fault_set",
      level: "info",
      source: { kind: "drive", id },
      params: { fault: "unresponsive" },
    });
    const buffer = appendAll([event("a"), event("b"), event("a")]);
    expect(buffer.entries.map((entry) => entry.count)).toEqual([1, 1, 1]);
  });
});

describe("reading the console buffer after a sequence", () => {
  it("returns the entries after it, and the last sequence", () => {
    const buffer = appendAll([migrated(1), migrated(2), migrated(3)]);
    const answer = readConsoleAfter(buffer, 1);
    expect(answer.entries.map((entry) => entry.sequence)).toEqual([2, 3]);
    expect(answer.lastSequence).toBe(3);
    expect(readConsoleAfter(buffer, 3).entries).toEqual([]);
  });

  it("returns a folded entry again, so that a client sees its count grow", () => {
    const read = appendAll([migrated(1)]);
    const folded = appendConsoleEvent(read, migrated(1), LATER);
    expect(readConsoleAfter(folded, read.lastSequence).entries[0]?.count).toBe(2);
  });
});
