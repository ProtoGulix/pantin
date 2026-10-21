import { describe, expect, it } from "vitest";
import { answerOf, consolePantin, entryOf, traceOf } from "../console/console-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { refreshConsole } from "./console-actions.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { openPantin } from "./pantin-actions.ts";
import type { StorePorts } from "./store-ports.ts";

// Verbose mode of the console (ADR 0061 point 8): the viewer preference, the
// request to the core, and the real state shown.

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function verboseStore(
  sent: boolean[],
  ports: Partial<StorePorts> = {},
  getConsole = async () => answerOf([]),
) {
  const store = testStore(
    {
      getConsole,
      getPantin: async () => consolePantin,
      setClockRunning: async () => ({
        running: true,
        step: 0,
        stepSeconds: 1 / 120,
        achievedRatio: 1,
        droppedSteps: 0,
      }),
      setConsoleVerbose: async (_id: string, verbose: boolean) => {
        sent.push(verbose);
        return { verbose };
      },
    },
    {},
    undefined,
    ports,
  );
  store.requestedPantinId = consolePantin.id;
  store.update(withOpenPantin(store.state, consolePantin));
  return store;
}

describe("the verbose preference", () => {
  it("is sent to the core when a Pantin is opened, and shown from the answer", async () => {
    const sent: boolean[] = [];
    const store = verboseStore(sent, { readConsoleVerbose: () => true });
    await openPantin(store, consolePantin.id);
    expect(sent).toEqual([true]);
    expect(store.state.console.verbose).toBe(true);
  });

  it("sends off when the preference is off", async () => {
    const sent: boolean[] = [];
    const store = verboseStore(sent);
    await openPantin(store, consolePantin.id);
    expect(sent).toEqual([false]);
    expect(store.state.console.verbose).toBe(false);
  });

  it("is remembered and sent when the toggle is clicked, both ways", async () => {
    const sent: boolean[] = [];
    const stored: boolean[] = [];
    const store = verboseStore(sent, { storeConsoleVerbose: (verbose) => stored.push(verbose) });
    const panel = createPanelIntents(store);
    panel.toggleConsoleVerbose();
    await settle();
    expect(store.state.console.verbose).toBe(true);
    panel.toggleConsoleVerbose();
    await settle();
    expect(store.state.console.verbose).toBe(false);
    expect([sent, stored]).toEqual([
      [true, false],
      [true, false],
    ]);
  });

  it("tells the user when the core refuses, and does not change the shown state", async () => {
    const store = testStore({
      setConsoleVerbose: async () => {
        throw new Error("offline");
      },
    });
    store.update(withOpenPantin(store.state, consolePantin));
    createPanelIntents(store).toggleConsoleVerbose();
    await settle();
    expect(store.state.console.verbose).toBe(false);
    expect(store.state.message).not.toBeNull();
  });
});

describe("the real verbose state", () => {
  it("follows another client that changed it, and keeps the viewer's preference", async () => {
    const stored: boolean[] = [];
    const store = verboseStore(
      [],
      { storeConsoleVerbose: (verbose) => stored.push(verbose) },
      async () => answerOf([traceOf(1), entryOf(2)], "console-1", 2, true),
    );
    await refreshConsole(store);
    expect(store.state.console.verbose).toBe(true);
    expect(stored).toEqual([]);
  });
});
