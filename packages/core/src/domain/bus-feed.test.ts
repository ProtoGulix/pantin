import type { ConsoleEntry, SimulationClockState, Tag } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { emitter } from "../test-support/conveyor-fixtures.ts";
import {
  type FeedSource,
  initialFeedCursor,
  nextFeed,
  subscribedCursor,
  subscribedTags,
} from "./bus-feed.ts";
import { createPantinDocument } from "./pantin-document.ts";

const DOCUMENT = createPantinDocument("Axis");
const CLOCK: SimulationClockState = {
  running: true,
  step: 0,
  stepSeconds: 1 / 120,
  achievedRatio: null,
  droppedSteps: 0,
};

function tag(name: string, value: number, forced = false): Tag {
  return { name, type: "float", direction: "command", value, forced };
}

function consoleEntry(sequence: number): ConsoleEntry {
  return {
    code: "clock_paused",
    level: "info",
    source: { kind: "pantin" },
    params: {},
    sequence,
    firstSequence: sequence,
    wallTime: "2026-10-13T08:00:00.000Z",
    simulationTime: 0,
    count: 1,
  };
}

function sourceOf(overrides: Partial<FeedSource> & { tagList?: Tag[] } = {}): FeedSource {
  const { tagList = [tag("a.b.c", 0)], ...rest } = overrides;
  return {
    stepCount: 0,
    document: DOCUMENT,
    mappingId: null,
    resetCount: 0,
    consoleId: "console-1",
    consoleLastSequence: 0,
    readConsole: () => [],
    clock: CLOCK,
    tags: () => tagList,
    ...rest,
  };
}

describe("subscribedTags", () => {
  const tags = [tag("a.b.c", 1), tag("a.b.d", 2, true)];

  it("keeps every tag for *, and only the named ones otherwise", () => {
    expect(subscribedTags(tags, "*")).toHaveLength(2);
    expect(subscribedTags(tags, new Set(["a.b.d", "a.b.missing"]))).toEqual([
      { name: "a.b.d", value: 2, forced: true },
    ]);
  });
});

describe("nextFeed tags", () => {
  const start = initialFeedCursor(sourceOf(), 0);
  const subscribed = subscribedCursor(start, "*", subscribedTags([tag("a.b.c", 0)], "*"));

  it("sends nothing for a connection with no subscription", () => {
    expect(nextFeed(start, sourceOf({ tagList: [tag("a.b.c", 9)] }), 0).messages).toEqual([]);
  });

  it("sends only the items whose value or force changed", () => {
    const source = sourceOf({ stepCount: 3, tagList: [tag("a.b.c", 0, true), tag("a.b.d", 4)] });
    const { messages, cursor } = nextFeed(subscribed, source, 0);
    expect(messages).toEqual([
      {
        type: "tags",
        step: 3,
        tags: [
          { name: "a.b.c", value: 0, forced: true },
          { name: "a.b.d", value: 4, forced: false },
        ],
      },
    ]);
    expect(nextFeed(cursor, source, 0).messages).toEqual([]);
  });

  it("sends a snapshot instead after a reset, and then goes on with changes", () => {
    const source = sourceOf({ stepCount: 7, resetCount: 1, tagList: [tag("a.b.c", 0)] });
    const first = nextFeed(subscribed, source, 0);
    expect(first.messages).toEqual([
      { type: "snapshot", step: 7, tags: [{ name: "a.b.c", value: 0, forced: false }] },
    ]);
    expect(nextFeed(first.cursor, source, 0).messages).toEqual([]);
  });
});

describe("nextFeed console", () => {
  it("sends the entries after the last sequence it saw, and not the backlog", () => {
    const cursor = initialFeedCursor(sourceOf({ consoleLastSequence: 5 }), 0);
    const seen: number[] = [];
    const source = sourceOf({
      consoleLastSequence: 7,
      readConsole: (after) => {
        seen.push(after);
        return [consoleEntry(6), consoleEntry(7)];
      },
    });
    const { messages, cursor: next } = nextFeed(cursor, source, 0);
    expect(seen).toEqual([5]);
    expect(messages.map((message) => message.type)).toEqual(["console", "console"]);
    expect(next.consoleSequence).toBe(7);
  });

  it("reads a console it did not know from the start", () => {
    const cursor = initialFeedCursor(sourceOf({ consoleLastSequence: 5 }), 0);
    const seen: number[] = [];
    nextFeed(
      cursor,
      sourceOf({
        consoleId: "console-2",
        readConsole: (after) => {
          seen.push(after);
          return [];
        },
      }),
      0,
    );
    expect(seen).toEqual([0]);
  });
});

describe("nextFeed trace entries", () => {
  it("never sends a trace entry (ADR 0061 point 2)", () => {
    const cursor = initialFeedCursor(sourceOf({ consoleLastSequence: 0 }), 0);
    const trace: ConsoleEntry = {
      code: "sensor_changed",
      level: "trace",
      source: { kind: "sensor", id: "end" },
      params: { tag: "main.end.state", value: 1 },
      sequence: 2,
      firstSequence: 2,
      wallTime: "2026-10-13T08:00:00.000Z",
      simulationTime: 0,
      count: 1,
    };
    const source = sourceOf({
      consoleLastSequence: 2,
      readConsole: () => [consoleEntry(1), trace],
    });
    const { cursor: next, messages } = nextFeed(cursor, source, 0);
    expect(messages).toEqual([{ type: "console", entry: consoleEntry(1) }]);
    expect(next.consoleSequence).toBe(2);
  });
});

describe("nextFeed clock", () => {
  const cursor = initialFeedCursor(sourceOf(), 10);

  it("sends the clock of a running Pantin once a second", () => {
    expect(nextFeed(cursor, sourceOf({ clock: { ...CLOCK, step: 60 } }), 10.5).messages).toEqual(
      [],
    );
    const { messages, cursor: next } = nextFeed(
      cursor,
      sourceOf({ clock: { ...CLOCK, step: 120 } }),
      11,
    );
    expect(messages).toEqual([{ type: "clock", clock: { ...CLOCK, step: 120 } }]);
    expect(next.clockSentAt).toBe(11);
  });

  it("sends it at once when the Pantin pauses or resumes", () => {
    const paused = { ...CLOCK, running: false };
    const { messages, cursor: next } = nextFeed(cursor, sourceOf({ clock: paused }), 10.1);
    expect(messages).toEqual([{ type: "clock", clock: paused }]);
    expect(nextFeed(next, sourceOf({ clock: CLOCK }), 10.2).messages).toHaveLength(1);
  });

  it("sends a paused Pantin's clock when its step moves, and not otherwise", () => {
    const paused = { ...CLOCK, running: false, step: 5 };
    const pausedCursor = nextFeed(cursor, sourceOf({ clock: paused }), 10.1).cursor;
    expect(nextFeed(pausedCursor, sourceOf({ clock: paused }), 20).messages).toEqual([]);
    const stepped = { ...paused, step: 8 };
    expect(nextFeed(pausedCursor, sourceOf({ clock: stepped }), 20.1).messages).toEqual([
      { type: "clock", clock: stepped },
    ]);
  });
});

describe("nextFeed io_changed", () => {
  const cursor = initialFeedCursor(sourceOf(), 0);

  it("is sent once when the tag list changes", () => {
    const withEmitter = { ...DOCUMENT, emitters: [emitter()] };
    const first = nextFeed(cursor, sourceOf({ document: withEmitter }), 0);
    expect(first.messages).toEqual([{ type: "io_changed" }]);
    expect(nextFeed(first.cursor, sourceOf({ document: withEmitter }), 0).messages).toEqual([]);
  });

  it("is sent when a tag is re-keyed", () => {
    const before = { ...DOCUMENT, emitters: [emitter()] };
    const after = { ...DOCUMENT, emitters: [emitter({ tagKey: "feeder" })] };
    const start = initialFeedCursor(sourceOf({ document: before }), 0);
    expect(nextFeed(start, sourceOf({ document: after }), 0).messages).toEqual([
      { type: "io_changed" },
    ]);
  });

  it("is not sent for an edit that leaves the tag list as it was", () => {
    const renamed = { ...DOCUMENT, name: "Other" };
    expect(nextFeed(cursor, sourceOf({ document: renamed }), 0).messages).toEqual([]);
  });
});

describe("nextFeed io_changed on a mapping change", () => {
  it("is sent once when the mapping id changes, and again for each new id", () => {
    const start = initialFeedCursor(sourceOf({ mappingId: "a" }), 0);
    const first = nextFeed(start, sourceOf({ mappingId: "b" }), 0);
    expect(first.messages).toEqual([{ type: "io_changed" }]);
    expect(nextFeed(first.cursor, sourceOf({ mappingId: "b" }), 0).messages).toEqual([]);
    expect(nextFeed(first.cursor, sourceOf({ mappingId: "c" }), 0).messages).toEqual([
      { type: "io_changed" },
    ]);
  });

  it("is sent when the mapping appears or goes (id null)", () => {
    const start = initialFeedCursor(sourceOf(), 0);
    const appeared = nextFeed(start, sourceOf({ mappingId: "a" }), 0);
    expect(appeared.messages).toEqual([{ type: "io_changed" }]);
    expect(nextFeed(appeared.cursor, sourceOf(), 0).messages).toEqual([{ type: "io_changed" }]);
  });

  it("is sent once when the tag list and the mapping change together", () => {
    const after = { ...DOCUMENT, emitters: [emitter()] };
    const start = initialFeedCursor(sourceOf({ mappingId: "a" }), 0);
    const next = nextFeed(start, sourceOf({ document: after, mappingId: "b" }), 0);
    expect(next.messages).toEqual([{ type: "io_changed" }]);
  });
});
