import { describe, expect, it } from "vitest";
import { answerOf, entryOf } from "./console-fixtures.ts";
import {
  CONSOLE_CLIENT_LIMIT,
  clearConsoleLines,
  EMPTY_CLIENT_CONSOLE,
  linesAfterClear,
  mergeConsoleResponse,
} from "./console-list.ts";

const merged = (...answers: ReturnType<typeof answerOf>[]) =>
  answers.reduce(mergeConsoleResponse, EMPTY_CLIENT_CONSOLE);

describe("mergeConsoleResponse", () => {
  it("appends new entries in order and remembers the last sequence", () => {
    const list = merged(answerOf([entryOf(1), entryOf(2)]), answerOf([entryOf(3)]));
    expect(list.entries.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect([list.consoleId, list.lastSequence]).toEqual(["console-1", 3]);
  });

  it("keeps the last sequence of an empty answer, and the same list object", () => {
    const first = merged(answerOf([entryOf(1)]));
    expect(mergeConsoleResponse(first, answerOf([], "console-1", 1))).toBe(first);
  });

  it("replaces a folded entry by its firstSequence and moves it to the end", () => {
    const list = merged(
      answerOf([
        entryOf(1),
        entryOf(2, {
          code: "step_error",
          level: "error",
          source: { kind: "pantin" },
          params: { detail: "x" },
        }),
      ]),
      answerOf([entryOf(3, { firstSequence: 1, count: 2 })]),
    );
    expect(list.entries.map((entry) => [entry.firstSequence, entry.sequence, entry.count])).toEqual(
      [
        [2, 2, 1],
        [1, 3, 2],
      ],
    );
    expect(list.lastSequence).toBe(3);
  });

  it("drops the list and starts over from 0 when the consoleId changes", () => {
    const before = merged(answerOf([entryOf(1), entryOf(2)]));
    const cleared = clearConsoleLines(before);
    const after = mergeConsoleResponse(cleared, answerOf([entryOf(1)], "console-2", 1));
    expect(after).toEqual({ consoleId: "console-2", lastSequence: 0, clearedUpTo: 0, entries: [] });
    // The next read, from 0, brings everything of the new console.
    const reread = mergeConsoleResponse(after, answerOf([entryOf(1), entryOf(2)], "console-2"));
    expect(reread.entries).toHaveLength(2);
    expect(reread.lastSequence).toBe(2);
  });
});

describe("the cap of the client list", () => {
  it("keeps the newest 1000 lines", () => {
    const entries = Array.from({ length: CONSOLE_CLIENT_LIMIT + 5 }, (_, index) =>
      entryOf(index + 1),
    );
    const list = merged(answerOf(entries));
    expect(list.entries).toHaveLength(CONSOLE_CLIENT_LIMIT);
    expect(list.entries[0]?.sequence).toBe(6);
  });

  it("keeps the cap across reads, counting a fold once", () => {
    const first = Array.from({ length: CONSOLE_CLIENT_LIMIT }, (_, index) => entryOf(index + 1));
    const list = merged(answerOf(first), answerOf([entryOf(1001, { firstSequence: 500 })]));
    expect(list.entries).toHaveLength(CONSOLE_CLIENT_LIMIT);
    expect(list.entries.at(-1)?.firstSequence).toBe(500);
    expect(list.entries[0]?.sequence).toBe(1);
  });
});

describe("clear point", () => {
  it("hides the lines read so far, and shows a folded one again with its new sequence", () => {
    const read = merged(answerOf([entryOf(1), entryOf(2)]));
    const cleared = clearConsoleLines(read);
    expect(cleared.clearedUpTo).toBe(2);
    expect(linesAfterClear(cleared)).toEqual([]);
    const later = mergeConsoleResponse(
      cleared,
      answerOf([entryOf(3, { firstSequence: 1, count: 4 }), entryOf(4)]),
    );
    expect(linesAfterClear(later).map((entry) => entry.sequence)).toEqual([3, 4]);
    // The lines are still held: only this viewer's display is cleared.
    expect(later.entries).toHaveLength(3);
  });
});
