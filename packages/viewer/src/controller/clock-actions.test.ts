import type { PoseSnapshot, SimulationClockState } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import type { ClockView } from "../clock/clock-model.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { clockIntents } from "./clock-actions.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The transport bar's actions and the clock part of the store (ADR 0032 points 1 and 10).

function clockOf(overrides: Partial<SimulationClockState> = {}): SimulationClockState {
  return {
    running: true,
    step: 0,
    stepSeconds: 1 / 120,
    achievedRatio: 1,
    droppedSteps: 0,
    ...overrides,
  };
}

function snapshotAt(stepCount: number): PoseSnapshot {
  return { stepCount, jointPositions: [], bodies: [] };
}

interface Calls {
  running: boolean[];
  steps: number[];
  panels: number;
  clocks: ClockView[];
}

function openStore(answer: SimulationClockState = clockOf({ running: false })) {
  const calls: Calls = { running: [], steps: [], panels: 0, clocks: [] };
  const store = testStore(
    {
      getPantin: async () => consolePantin,
      setClockRunning: async (_id, running) => {
        calls.running.push(running);
        return { ...answer, running };
      },
      stepClock: async (_id, steps) => {
        calls.steps.push(steps);
        return { ...answer, step: answer.step + steps };
      },
    },
    {},
    undefined,
    {
      renderPanel: () => {
        calls.panels += 1;
      },
      showClock: (view) => calls.clocks.push(view),
    },
  );
  store.requestedPantinId = consolePantin.id;
  store.update(withOpenPantin(store.state, consolePantin));
  calls.panels = 0;
  calls.clocks.length = 0;
  return { store, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function intentsOf(store: ViewerStore) {
  return clockIntents(store);
}

describe("opening a Pantin", () => {
  it("resumes its clock once the open succeeded", async () => {
    const { store, calls } = openStore();
    createPanelIntents(store).openPantin(consolePantin.id);
    await flush();
    expect(calls.running).toEqual([true]);
    expect(store.clockModel.state?.running).toBe(true);
  });

  it("sends nothing when the open failed", async () => {
    const calls: boolean[] = [];
    const store = testStore({
      getPantin: async () => {
        throw new PantinApiError("network", "down", null, null);
      },
      setClockRunning: async (_id, running) => {
        calls.push(running);
        return clockOf();
      },
    });
    createPanelIntents(store).openPantin("press");
    await flush();
    expect(calls).toEqual([]);
  });
});

describe("opening a Pantin that is already on screen", () => {
  it("sends nothing for a failed re-open of the Pantin already on screen", async () => {
    const calls: boolean[] = [];
    const store = testStore({
      getPantin: async () => {
        throw new PantinApiError("network", "down", null, null);
      },
      setClockRunning: async (_id, running) => {
        calls.push(running);
        return clockOf();
      },
    });
    store.update(withOpenPantin(store.state, consolePantin));
    createPanelIntents(store).openPantin(consolePantin.id);
    await flush();
    expect(calls).toEqual([]);
  });

  it("sends nothing for a stale open of the Pantin on screen, replaced by another request", async () => {
    const calls: boolean[] = [];
    let answerStale: (response: typeof consolePantin) => void = () => undefined;
    const store = testStore({
      getPantin: (id) =>
        id === consolePantin.id
          ? new Promise((resolve) => {
              answerStale = resolve;
            })
          : new Promise(() => undefined),
      setClockRunning: async (_id, running) => {
        calls.push(running);
        return clockOf();
      },
    });
    store.update(withOpenPantin(store.state, consolePantin));
    const intents = createPanelIntents(store);
    intents.openPantin(consolePantin.id);
    intents.openPantin("other");
    answerStale(consolePantin);
    await flush();
    expect(calls).toEqual([]);
  });

  it("only tells the user when the resume fails: the Pantin stays open", async () => {
    const store = testStore({
      getPantin: async () => consolePantin,
      setClockRunning: async () => {
        throw new PantinApiError("api", "refused", null, 500);
      },
    });
    createPanelIntents(store).openPantin(consolePantin.id);
    await flush();
    expect(store.state.openPantin?.id).toBe(consolePantin.id);
    expect(store.state.message).toMatchObject({ level: "error", key: "message.clockResume" });
  });
});

describe("the transport buttons", () => {
  it("pauses a running Pantin and resumes a paused one with PUT", async () => {
    const { store, calls } = openStore();
    store.receiveClock(clockOf({ running: true }));
    intentsOf(store).toggleClockRunning();
    await flush();
    intentsOf(store).toggleClockRunning();
    await flush();
    expect(calls.running).toEqual([false, true]);
  });

  it("steps by 1 and by 10 while paused, and shows the answered step", async () => {
    const { store, calls } = openStore();
    store.receiveClock(clockOf({ running: false, step: 100 }));
    intentsOf(store).stepClock(1);
    await flush();
    intentsOf(store).stepClock(10);
    await flush();
    expect(calls.steps).toEqual([1, 10]);
    // The step of the core's last answer, not a count of the viewer's.
    expect(store.clockModel.step).toBe(10);
  });

  it("asks nothing while the clock runs or is still unknown", async () => {
    const { store, calls } = openStore();
    intentsOf(store).stepClock(1);
    intentsOf(store).toggleClockRunning();
    store.receiveClock(clockOf({ running: true }));
    intentsOf(store).stepClock(10);
    await flush();
    expect([calls.steps, calls.running]).toEqual([[], []]);
  });
});

describe("refused and late answers", () => {
  it("turns a refused request into a message", async () => {
    const store = testStore({
      getPantin: async () => consolePantin,
      stepClock: async () => {
        throw new PantinApiError("api", "running", "conflict", 409);
      },
    });
    store.update(withOpenPantin(store.state, consolePantin));
    store.receiveClock(clockOf({ running: false }));
    intentsOf(store).stepClock(1);
    await flush();
    expect(store.state.message).toMatchObject({ level: "error", key: "error.code.conflict" });
  });

  it("drops an answer that arrives after the Pantin was closed", async () => {
    const { store } = openStore();
    store.receiveClock(clockOf({ running: false, step: 5 }));
    intentsOf(store).stepClock(1);
    store.update({ ...store.state, openPantin: null });
    await flush();
    expect(store.clockModel.step).toBe(0);
  });
});

describe("the store and the clock", () => {
  it("keeps the latest step of a pose or a clock event, without a state update", () => {
    const { store, calls } = openStore();
    store.receiveClock(clockOf({ step: 120 }));
    store.receivePose(snapshotAt(121));
    store.receivePose(snapshotAt(122));
    expect(store.clockModel.step).toBe(122);
    expect(calls.panels).toBe(0);
    expect(calls.clocks.at(-1)?.stepText).toBe("122 pas");
  });

  it("writes the bar in place when running or the warning changes, never through a redraw", () => {
    const { store, calls } = openStore();
    store.receiveClock(clockOf());
    store.receiveClock(clockOf({ running: false }));
    store.receiveClock(clockOf({ running: false, achievedRatio: 0.5 }));
    expect(calls.panels).toBe(0);
    expect(calls.clocks.map((view) => [view.running, view.warning !== null])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("starts from a fresh clock when another Pantin is followed", () => {
    const { store } = openStore();
    store.receiveClock(clockOf({ step: 50, achievedRatio: 0.1 }));
    store.update({ ...store.state, openPantin: null });
    expect(store.clockModel.state).toBeNull();
    expect(store.clockView().visible).toBe(false);
  });
});
