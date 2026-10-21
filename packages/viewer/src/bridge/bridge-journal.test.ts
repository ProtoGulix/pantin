import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  CLOSED_JOURNAL,
  isScrolledToEnd,
  JOURNAL_MAX_ENTRIES,
  journalEntriesOf,
  journalViewOf,
  localClockTime,
  scrollTopAfterRefresh,
} from "./bridge-journal.ts";

const t = createTranslator("en");
const open = { ...CLOSED_JOURNAL, open: true };

const TIME = "2026-10-17T10:00:00.250Z";
const core = (level: string, text: string) => `${TIME} CORE ${level} ${text}`;

describe("localClockTime", () => {
  it("is HH:MM:SS.mmm in the local zone", () => {
    const date = new Date(TIME);
    const expected = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}.250`;
    expect(localClockTime(TIME)).toBe(expected);
  });

  it("shows an unreadable time as written", () => {
    expect(localClockTime("2026-99-99Tjunk")).toBe("2026-99-99Tjunk");
  });
});

describe("journalEntriesOf", () => {
  it("keeps the newest entries when the file is long", () => {
    const text = Array.from({ length: JOURNAL_MAX_ENTRIES + 3 }, (_, i) => core("INFO", `n ${i}`));
    const { entries, hiddenCount } = journalEntriesOf(text.join("\n"));
    expect([entries.length, hiddenCount, entries[0]?.message]).toEqual([
      JOURNAL_MAX_ENTRIES,
      3,
      "n 3",
    ]);
  });
});

describe("journalViewOf", () => {
  it("is null while the window is closed or no Pantin is open", () => {
    expect(journalViewOf(CLOSED_JOURNAL, "press", t)).toBeNull();
    expect(journalViewOf(open, null, t)).toBeNull();
  });

  it("says it is reading before the first answer", () => {
    expect(journalViewOf(open, "press", t)?.placeholder).toBe("Reading the log…");
  });

  it("explains an empty file", () => {
    const view = journalViewOf({ ...open, text: "" }, "press", t);
    expect(view?.placeholder).toBe("No log yet: it fills as soon as the bridge starts.");
  });

  it("shows a failed first read as an error, not as loading", () => {
    const view = journalViewOf({ ...open, error: "Cannot reach the core" }, "press", t);
    expect([view?.placeholder, view?.errorText]).toEqual([
      null,
      "Cannot read the log: Cannot reach the core",
    ]);
  });

  it("keeps the text read before when a refresh fails", () => {
    const text = `${core("INFO", "a")}\n${core("INFO", "b")}`;
    const view = journalViewOf({ ...open, text, error: "boom" }, "press", t);
    expect([view?.entries.length, view?.errorText === null]).toEqual([2, false]);
  });

  it("offers the whole file to Copy and the download route", () => {
    const view = journalViewOf({ ...open, text: "a\nb\n" }, "press", t);
    expect([view?.copyText, view?.downloadUrl]).toEqual([
      "a\nb\n",
      "/api/pantins/press/bridges/modbus_tcp_slave/log?download=1",
    ]);
  });

  it("tells how many older entries are cut", () => {
    const text = Array.from({ length: JOURNAL_MAX_ENTRIES + 2 }, () => core("INFO", "x")).join(
      "\n",
    );
    expect(journalViewOf({ ...open, text }, "press", t)?.truncatedText).toContain(
      "2 older entries",
    );
  });
});

describe("journalViewOf entries and filters", () => {
  const text = [
    core("INFO", "started"),
    `${TIME} BRIDGE 2026-10-17 12:00:00,100 WARNING a.b: slow`,
    `${TIME} BRIDGE 2026-10-17 12:00:00,200 ERROR a.b: failed`,
    "  traceback line",
    core("ERROR", "second"),
  ].join("\n");

  it("describes an entry with labels, local time and the logger as tooltip", () => {
    const entry = journalViewOf({ ...open, text }, "press", t)?.entries[1];
    expect(entry).toMatchObject({
      timeTitle: TIME,
      sourceLabel: "Bridge",
      levelLabel: "Warn.",
      logger: "a.b",
      message: "slow",
    });
  });

  it("counts the entries of each level, in the console's order", () => {
    const filters = journalViewOf({ ...open, text }, "press", t)?.filters;
    expect(filters?.map(({ level, count, pressed }) => [level, count, pressed])).toEqual([
      ["error", 2, true],
      ["warning", 1, true],
      ["info", 1, true],
    ]);
  });

  it("hides the filtered levels but still counts them", () => {
    const hiddenLevels = new Set(["error" as const]);
    const view = journalViewOf({ ...open, text, hiddenLevels }, "press", t);
    expect(view?.entries.map((entry) => entry.message)).toEqual(["started", "slow"]);
    expect(view?.filters[0]).toMatchObject({ count: 2, pressed: false });
    expect(view?.copyText).toBe(text);
  });

  it("says so when every level is filtered out", () => {
    const hiddenLevels = new Set(["error" as const, "warning" as const, "info" as const]);
    const view = journalViewOf({ ...open, text, hiddenLevels }, "press", t);
    expect([view?.entries.length, view?.placeholder]).toEqual([
      0,
      "No entry for the levels shown.",
    ]);
  });

  it("keeps the continuation lines with their entry", () => {
    expect(journalViewOf({ ...open, text }, "press", t)?.entries[2]?.continuation).toEqual([
      "  traceback line",
    ]);
  });
});

describe("the redraw key", () => {
  const keyOf = (model: Parameters<typeof journalViewOf>[0]) =>
    journalViewOf(model, "press", t)?.redrawKey;
  const text = core("INFO", "a");

  it("is stable while nothing changed", () => {
    expect(keyOf({ ...open, text })).toBe(keyOf({ ...open, text, reading: true }));
  });

  it("changes when the file grows, restarts or a filter moves", () => {
    const base = keyOf({ ...open, text });
    const grown = keyOf({ ...open, text: `${text}\n${core("INFO", "b")}` });
    const restarted = keyOf({ ...open, text: core("INFO", "z") });
    const filtered = keyOf({ ...open, text, hiddenLevels: new Set(["info" as const]) });
    expect(new Set([base, grown, restarted, filtered]).size).toBe(4);
  });
});

describe("scroll following", () => {
  const atEnd = { scrollTop: 500, clientHeight: 300, scrollHeight: 800 };
  const scrolledUp = { scrollTop: 100, clientHeight: 300, scrollHeight: 800 };

  it("knows a reader at the end, with a little tolerance", () => {
    expect(isScrolledToEnd(atEnd)).toBe(true);
    expect(isScrolledToEnd({ ...atEnd, scrollTop: 495 })).toBe(true);
    expect(isScrolledToEnd(scrolledUp)).toBe(false);
  });

  it("goes to the end on the first display", () => {
    expect(scrollTopAfterRefresh(null, 800, 300)).toBe(500);
  });

  it("follows the new lines when the reader was at the end", () => {
    expect(scrollTopAfterRefresh(atEnd, 900, 300)).toBe(600);
  });

  it("keeps the place of a reader who scrolled up", () => {
    expect(scrollTopAfterRefresh(scrolledUp, 900, 300)).toBe(100);
  });
});
