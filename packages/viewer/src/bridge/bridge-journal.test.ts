import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  CLOSED_JOURNAL,
  isScrolledToEnd,
  JOURNAL_MAX_LINES,
  journalLevelOf,
  journalLinesOf,
  journalViewOf,
  scrollTopAfterRefresh,
} from "./bridge-journal.ts";

const t = createTranslator("en");
const open = { ...CLOSED_JOURNAL, open: true };

describe("journalLevelOf", () => {
  it.each([
    ["2026-10-17T10:00:00Z CORE INFO start requested", "normal"],
    ["2026-10-17T10:00:00Z CORE ERROR spawn failed", "error"],
    ["2026-10-17T10:00:00Z BRIDGE WARNING refused request", "warning"],
    ["2026-10-17T10:00:00Z BRIDGE 2026-10-17 10:00:00,123 WARNING refused", "warning"],
    ["2026-10-17T10:00:00Z BRIDGE 2026-10-17 10:00:00,123 CRITICAL boom", "error"],
    ["2026-10-17T10:00:00Z BRIDGE INFO connection from 10.0.0.5", "normal"],
    ["2026-10-17T10:00:00Z BRIDGE the word WARNING inside a message", "normal"],
    ["no prefix at all", "normal"],
  ])("%s is %s", (line, level) => {
    expect(journalLevelOf(line)).toBe(level);
  });
});

describe("journalLinesOf", () => {
  it("drops empty lines and keeps the order", () => {
    const { lines } = journalLinesOf("a\n\nb\n");
    expect(lines.map((line) => line.text)).toEqual(["a", "b"]);
  });

  it("keeps the newest lines when the file is long", () => {
    const text = Array.from({ length: JOURNAL_MAX_LINES + 3 }, (_, index) => `line ${index}`);
    const { lines, hiddenCount } = journalLinesOf(text.join("\n"));
    expect([lines.length, hiddenCount, lines[0]?.text]).toEqual([JOURNAL_MAX_LINES, 3, "line 3"]);
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
    const view = journalViewOf({ ...open, text: "a\nb", error: "boom" }, "press", t);
    expect([view?.lines.length, view?.errorText === null]).toEqual([2, false]);
  });

  it("offers the whole file to Copy and the download route", () => {
    const view = journalViewOf({ ...open, text: "a\nb\n" }, "press", t);
    expect([view?.copyText, view?.downloadUrl]).toEqual([
      "a\nb\n",
      "/api/pantins/press/bridge/log?download=1",
    ]);
  });

  it("tells how many older lines are cut", () => {
    const text = Array.from({ length: JOURNAL_MAX_LINES + 2 }, () => "x").join("\n");
    expect(journalViewOf({ ...open, text }, "press", t)?.truncatedText).toContain("2 older lines");
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
