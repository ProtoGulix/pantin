import { describe, expect, it } from "vitest";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { consolePantin as pantin } from "./console-fixtures.ts";
import {
  INITIAL_CONSOLE_STATE,
  parseStoredVerbose,
  withConsoleLevelToggled,
  withConsoleToggled,
  withConsoleVerbose,
} from "./console-state.ts";

describe("console state", () => {
  it("is closed at the start, and opens and closes only when asked", () => {
    expect(INITIAL_CONSOLE_STATE.open).toBe(false);
    const opened = withConsoleToggled(INITIAL_CONSOLE_STATE);
    expect(opened.open).toBe(true);
    expect(withConsoleToggled(opened).open).toBe(false);
  });

  it("toggles a level in and out of the hidden ones", () => {
    const hidden = withConsoleLevelToggled(INITIAL_CONSOLE_STATE, "info");
    expect([...hidden.hiddenLevels]).toEqual(["info"]);
    expect(withConsoleLevelToggled(hidden, "info").hiddenLevels.size).toBe(0);
  });

  it("is not verbose at the start, and follows what the core reports", () => {
    expect(INITIAL_CONSOLE_STATE.verbose).toBe(false);
    const verbose = withConsoleVerbose(INITIAL_CONSOLE_STATE, true);
    expect(verbose.verbose).toBe(true);
    expect(withConsoleVerbose(verbose, true)).toBe(verbose);
  });

  it("reads the stored preference, off unless it says true", () => {
    expect([parseStoredVerbose("true"), parseStoredVerbose("false")]).toEqual([true, false]);
    expect([parseStoredVerbose(null), parseStoredVerbose("garbage")]).toEqual([false, false]);
  });

  it("keeps the panel's settings when a Pantin opens", () => {
    const base = initialViewerState("fr");
    const opened = { ...base, console: withConsoleToggled(base.console) };
    expect(withOpenPantin(opened, pantin).console.open).toBe(true);
  });
});
