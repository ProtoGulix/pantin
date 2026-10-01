import type { ConsoleResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { answerOf, consolePantin, entryOf } from "../console/console-fixtures.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { jointNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { clearConsole, refreshConsole } from "./console-actions.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import type { StorePorts } from "./viewer-store.ts";

// Reading the console in the 250 ms loop, and the panel's intents (ADR 0031).

function openStore(
  getConsole: (pantinId: string, after: number) => Promise<ConsoleResponse>,
  ports: Partial<StorePorts> = {},
) {
  const store = testStore({ getConsole }, {}, undefined, ports);
  store.requestedPantinId = consolePantin.id;
  store.update(withOpenPantin(store.state, consolePantin));
  return store;
}

describe("refreshConsole", () => {
  it("reads nothing while no Pantin is open", async () => {
    let reads = 0;
    const store = testStore({
      getConsole: async () => {
        reads += 1;
        return answerOf([]);
      },
    });
    await refreshConsole(store);
    expect(reads).toBe(0);
  });

  it("reads after the last sequence it has, and keeps what comes", async () => {
    const afters: number[] = [];
    const store = openStore(async (_id, after) => {
      afters.push(after);
      return after === 0 ? answerOf([entryOf(1), entryOf(2)]) : answerOf([], "console-1", 2);
    });
    await refreshConsole(store);
    await refreshConsole(store);
    expect(afters).toEqual([0, 2]);
    expect(store.consoleList.entries).toHaveLength(2);
    expect(store.state.console.open).toBe(false);
  });

  it("starts over from 0 when the consoleId changes", async () => {
    const afters: number[] = [];
    const answers = [
      answerOf([entryOf(1), entryOf(2)], "console-1"),
      answerOf([entryOf(1)], "console-2"),
      answerOf([entryOf(1)], "console-2"),
    ];
    const store = openStore(async (_id, after) => {
      afters.push(after);
      return answers.shift() ?? answerOf([]);
    });
    await refreshConsole(store);
    await refreshConsole(store);
    expect(store.consoleList.entries).toEqual([]);
    await refreshConsole(store);
    expect(afters).toEqual([0, 2, 0]);
    expect(store.consoleList.entries).toHaveLength(1);
  });
});

describe("refreshConsole in flight", () => {
  it("asks for one read at a time", async () => {
    let reads = 0;
    let finish: (answer: ConsoleResponse) => void = () => undefined;
    const store = openStore(
      () =>
        new Promise((resolve) => {
          reads += 1;
          finish = resolve;
        }),
    );
    const first = refreshConsole(store);
    await refreshConsole(store);
    expect(reads).toBe(1);
    finish(answerOf([]));
    await first;
  });

  it("drops the answer for a Pantin closed meanwhile, and a failed read changes nothing", async () => {
    let finish: (answer: ConsoleResponse) => void = () => undefined;
    const store = openStore(() => new Promise((resolve) => (finish = resolve)));
    const reading = refreshConsole(store);
    store.update({ ...store.state, openPantin: null });
    finish(answerOf([entryOf(1)]));
    await reading;
    expect(store.consoleList.entries).toEqual([]);

    const failing = openStore(async () => {
      throw new Error("core away");
    });
    const before = failing.state;
    await refreshConsole(failing);
    expect(failing.state).toBe(before);
    expect(failing.readingConsole).toBe(false);
  });
});

async function filledStore() {
  const store = openStore(async () =>
    answerOf([
      entryOf(1),
      entryOf(2, {
        code: "fault_set",
        level: "info",
        source: { kind: "joint", id: "j1" },
        params: { fault: "jammed" },
      }),
      entryOf(3, {
        code: "migrated",
        level: "info",
        source: { kind: "pantin" },
        params: { from: 1, to: 2 },
      }),
      entryOf(4, {
        code: "forced_tag_written",
        level: "error",
        source: { kind: "sensor", id: "gone" },
        params: { tag: "press.valve.extend", forcedValue: 1, writtenValue: 0 },
      }),
    ]),
  );
  await refreshConsole(store);
  return store;
}

describe("console intents", () => {
  it("opens and closes the panel, and toggles a level", () => {
    const store = openStore(async () => answerOf([]));
    const panel = createPanelIntents(store);
    panel.toggleConsole();
    expect(store.state.console.open).toBe(true);
    panel.toggleConsoleLevel("info");
    expect([...store.state.console.hiddenLevels]).toEqual(["info"]);
    panel.toggleConsole();
    expect(store.state.console.open).toBe(false);
  });

  it("selects the source of a line: a device, a joint row, the Pantin", async () => {
    const store = await filledStore();
    const intents = createPanelIntents(store);
    intents.selectConsoleSource({ kind: "drive", id: "v1" });
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "drive", id: "v1" });
    intents.selectConsoleSource({ kind: "joint", id: "j1" });
    expect(selectedNodeIdOf(store.state.selection)).toBe(jointNodeId("press", "j1", "s1"));
    intents.selectConsoleSource({ kind: "pantin" });
    expect(selectedNodeIdOf(store.state.selection)).toBe(pantinNodeId("press"));
  });

  it("does nothing for a source that no longer exists", async () => {
    const store = await filledStore();
    const before = store.state.selection;
    createPanelIntents(store).selectConsoleSource({ kind: "sensor", id: "gone" });
    expect(store.state.selection).toBe(before);
  });

  it("clears the lines read so far in the viewer only", async () => {
    const store = await filledStore();
    clearConsole(store);
    expect(store.consoleList.clearedUpTo).toBe(4);
    expect(store.consoleList.entries).toHaveLength(4);
  });
});

describe("console lines in place", () => {
  it("pushes every fold to the panel without a state update or a redraw", async () => {
    let redraws = 0;
    const pushed: (string | null | undefined)[] = [];
    const answers = [
      answerOf([entryOf(1)]),
      answerOf([entryOf(2, { firstSequence: 1, count: 2 })]),
      answerOf([entryOf(3, { firstSequence: 1, count: 3 })]),
    ];
    const store = openStore(async () => answers.shift() ?? answerOf([]), {
      renderPanel: () => {
        redraws += 1;
      },
      showConsoleLive: (view) => pushed.push(view?.lines[0]?.repeat),
    });
    const before = [redraws, store.state];
    await refreshConsole(store);
    await refreshConsole(store);
    await refreshConsole(store);
    expect([redraws, store.state]).toEqual(before);
    expect(pushed).toEqual([null, "×2", "×3"]);
    expect(store.consoleList.entries.map((entry) => entry.count)).toEqual([3]);
  });

  it("drops an answer when the list is no longer where the read started", async () => {
    let finish: (answer: ConsoleResponse) => void = () => undefined;
    const answers = [
      Promise.resolve(answerOf([entryOf(1), entryOf(2)])),
      new Promise<ConsoleResponse>((resolve) => (finish = resolve)),
    ];
    const store = openStore(async () => answers.shift() ?? answerOf([]));
    await refreshConsole(store);
    const reading = refreshConsole(store);
    // Closed and opened again, same console id: the list starts over.
    store.update({ ...store.state, openPantin: null });
    store.update(withOpenPantin(store.state, consolePantin));
    finish(answerOf([entryOf(3)]));
    await reading;
    expect(store.consoleList.entries).toEqual([]);
  });
});
