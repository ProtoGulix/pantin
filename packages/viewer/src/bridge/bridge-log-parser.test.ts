import { describe, expect, it } from "vitest";
import { parseBridgeLog } from "./bridge-log-parser.ts";

const TIME = "2026-10-17T07:20:51.917Z";

function first(text: string) {
  const entry = parseBridgeLog(text)[0];
  if (entry === undefined) {
    throw new Error("no entry parsed");
  }
  return entry;
}

describe("a core line", () => {
  it("has its level and message", () => {
    expect(first(`${TIME} CORE INFO Start requested: listen 0.0.0.0.`)).toEqual({
      time: TIME,
      source: "core",
      level: "info",
      logger: null,
      message: "Start requested: listen 0.0.0.0.",
      continuation: [],
    });
  });

  it.each([
    ["WARNING", "warning"],
    ["ERROR", "error"],
    ["CRITICAL", "error"],
    ["DEBUG", "info"],
  ])("shows %s as %s", (word, level) => {
    expect(first(`${TIME} CORE ${word} text`).level).toBe(level);
  });

  it("does not take a level word inside the message for the level", () => {
    const entry = first(`${TIME} CORE INFO the ERROR word`);
    expect([entry.level, entry.message]).toEqual(["info", "the ERROR word"]);
  });

  it("is info with the whole text when the level is missing", () => {
    const entry = first(`${TIME} CORE just some text`);
    expect([entry.level, entry.message]).toEqual(["info", "just some text"]);
  });

  it("accepts a line cut right after the source", () => {
    expect(first(`${TIME} CORE`)).toMatchObject({ source: "core", level: "info", message: "" });
  });
});

describe("a bridge line", () => {
  it("splits the Python logging layout", () => {
    const entry = first(
      `${TIME} BRIDGE 2026-10-17 09:20:52,057 INFO pantin_bridge.bridge: Bridge ready: 1 module`,
    );
    expect([entry.source, entry.level, entry.logger, entry.message]).toEqual([
      "bridge",
      "info",
      "pantin_bridge.bridge",
      "Bridge ready: 1 module",
    ]);
  });

  it.each([
    ["WARNING", "warning"],
    ["ERROR", "error"],
    ["CRITICAL", "error"],
  ])("reads %s", (word, level) => {
    expect(first(`${TIME} BRIDGE 2026-10-17 09:20:52,057 ${word} a.b: boom`).level).toBe(level);
  });

  it("reads an ISO timestamp with a zone before the level", () => {
    const entry = first(`${TIME} BRIDGE 2026-10-17T09:20:52.057+02:00 ERROR a: boom`);
    expect([entry.level, entry.logger, entry.message]).toEqual(["error", "a", "boom"]);
  });

  it("reads a level with no timestamp and no logger", () => {
    const entry = first(`${TIME} BRIDGE WARNING refused request`);
    expect([entry.level, entry.logger, entry.message]).toEqual([
      "warning",
      null,
      "refused request",
    ]);
  });
});

describe("a bridge line without the standard layout", () => {
  it("keeps the message whole when the logger has a colon-less layout", () => {
    const entry = first(`${TIME} BRIDGE 2026-10-17 09:20:52,057 INFO no logger here`);
    expect([entry.logger, entry.message]).toEqual([null, "no logger here"]);
  });

  it("takes free text as info, whole, whatever it contains", () => {
    const entry = first(`${TIME} BRIDGE the word WARNING inside a message`);
    expect([entry.level, entry.logger, entry.message]).toEqual([
      "info",
      null,
      "the word WARNING inside a message",
    ]);
  });

  it("keeps a timestamp that no level follows in the message", () => {
    const entry = first(`${TIME} BRIDGE 2026-10-17 09:20:52,057 started`);
    expect([entry.level, entry.message]).toEqual(["info", "2026-10-17 09:20:52,057 started"]);
  });

  it("keeps multi-byte text intact", () => {
    const entry = first(`${TIME} BRIDGE 2026-10-17 09:20:52,057 ERROR a.b: échec 日本語 🚧`);
    expect(entry.message).toBe("échec 日本語 🚧");
  });
});

describe("continuation and odd files", () => {
  it("attaches lines without a prefix to the entry before", () => {
    const entries = parseBridgeLog(
      [
        `${TIME} BRIDGE 2026-10-17 09:20:52,057 ERROR a: failed`,
        "Traceback (most recent call last):",
        '  File "bridge.py", line 3',
        `${TIME} CORE INFO next`,
      ].join("\n"),
    );
    expect(entries.map((entry) => entry.continuation)).toEqual([
      ["Traceback (most recent call last):", '  File "bridge.py", line 3'],
      [],
    ]);
  });

  it("makes an entry without time or source of lines found before any entry", () => {
    const entries = parseBridgeLog(`  File "x.py"\n${TIME} CORE INFO ok`);
    expect(entries[0]).toMatchObject({ time: null, source: null, message: '  File "x.py"' });
    expect(entries).toHaveLength(2);
  });

  it("takes a line cut inside its time for a continuation", () => {
    const entries = parseBridgeLog(`${TIME} CORE INFO a\n2026-10-17T07:20:5`);
    expect([entries.length, entries[0]?.continuation]).toEqual([1, ["2026-10-17T07:20:5"]]);
  });

  it("drops blank lines and the carriage returns of a Windows file", () => {
    const entries = parseBridgeLog(`${TIME} CORE INFO a\r\n\r\n${TIME} CORE INFO b\r\n`);
    expect(entries.map((entry) => entry.message)).toEqual(["a", "b"]);
  });

  it("is empty for an empty file", () => {
    expect(parseBridgeLog("")).toEqual([]);
  });
});
