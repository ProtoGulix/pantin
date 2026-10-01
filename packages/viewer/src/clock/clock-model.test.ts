import type { SimulationClockState } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  buildClockView,
  type ClockModel,
  clockAfterClockState,
  clockAfterPose,
  formatSimulatedSeconds,
  INITIAL_CLOCK_MODEL,
} from "./clock-model.ts";

const STEP_SECONDS = 1 / 120;

function stateOf(overrides: Partial<SimulationClockState> = {}): SimulationClockState {
  return {
    running: true,
    step: 0,
    stepSeconds: STEP_SECONDS,
    achievedRatio: 1,
    droppedSteps: 0,
    ...overrides,
  };
}

function viewOf(model: ClockModel, language: "fr" | "en" = "en") {
  return buildClockView(model, true, language, createTranslator(language));
}

describe("formatSimulatedSeconds", () => {
  it("shows milliseconds with the decimal separator of the language", () => {
    expect(formatSimulatedSeconds(1234, STEP_SECONDS, "fr")).toBe("10,283");
    expect(formatSimulatedSeconds(1234, STEP_SECONDS, "en")).toBe("10.283");
  });

  it("starts at zero and never groups thousands", () => {
    expect(formatSimulatedSeconds(0, STEP_SECONDS, "en")).toBe("0.000");
    expect(formatSimulatedSeconds(1_200_000, STEP_SECONDS, "en")).toBe("10000.000");
  });
});

describe("clock model transitions", () => {
  it("takes the step of a pose, then of a clock event, whichever came last", () => {
    const afterPose = clockAfterPose(INITIAL_CLOCK_MODEL, 7);
    expect(afterPose).toMatchObject({ step: 7, state: null });
    const afterClock = clockAfterClockState(afterPose, stateOf({ step: 120 }));
    expect(afterClock.step).toBe(120);
    expect(clockAfterPose(afterClock, 121)).toMatchObject({
      step: 121,
      state: stateOf({ step: 120 }),
    });
  });

  it("returns the same model when a pose brings no new step", () => {
    const model = clockAfterPose(INITIAL_CLOCK_MODEL, 7);
    expect(clockAfterPose(model, 7)).toBe(model);
  });

  it("follows pause and resume", () => {
    const running = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf());
    const paused = clockAfterClockState(running, stateOf({ running: false, step: 5 }));
    expect([viewOf(running).running, viewOf(paused).running]).toEqual([true, false]);
    expect(viewOf(clockAfterClockState(paused, stateOf({ step: 5 }))).running).toBe(true);
  });
});

describe("clock view", () => {
  it("offers nothing to command before the first clock state", () => {
    const view = viewOf(clockAfterPose(INITIAL_CLOCK_MODEL, 3));
    expect([view.canToggle, view.canStep, view.timeText, view.stepText]).toEqual([
      false,
      false,
      "— s",
      "3 steps",
    ]);
  });

  it("enables the step buttons only while paused", () => {
    const running = viewOf(clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf()));
    const paused = viewOf(clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ running: false })));
    expect([running.canToggle, running.canStep]).toEqual([true, false]);
    expect([paused.canToggle, paused.canStep]).toEqual([true, true]);
    expect([running.toggleLabel, paused.toggleLabel]).toEqual(["Pause", "Resume"]);
  });

  it("writes the time and the step count in each language", () => {
    const model = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ step: 1234 }));
    expect(viewOf(model, "fr")).toMatchObject({ timeText: "10,283 s", stepText: "1234 pas" });
    expect(viewOf(model, "en")).toMatchObject({ timeText: "10.283 s", stepText: "1234 steps" });
  });

  it("uses singular and plural texts for the step count and the hints", () => {
    const one = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ step: 1, running: false }));
    expect(viewOf(one, "en")).toMatchObject({
      stepText: "1 step",
      stepOneHint: "Advances the simulation by 1 step; available while paused",
      stepTenHint: "Advances the simulation by 10 steps; available while paused",
    });
    expect(viewOf(one, "fr")).toMatchObject({
      stepText: "1 pas",
      stepOneHint: "Avance la simulation de 1 pas ; disponible en pause",
      stepTenHint: "Avance la simulation de 10 pas ; disponible en pause",
    });
  });

  it("is hidden when no Pantin is open", () => {
    const model = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf());
    expect(buildClockView(model, false, "en", createTranslator("en")).visible).toBe(false);
  });
});

describe("clock warning", () => {
  it("shows no warning at a healthy ratio or before the window is filled", () => {
    for (const achievedRatio of [1, 0.98, null]) {
      expect(
        viewOf(clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio }))).warning,
      ).toBeNull();
    }
  });

  it("warns below 0.98 with the ratio rounded down, in both languages", () => {
    const model = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio: 0.92 }));
    expect(viewOf(model, "fr").warning?.text).toBe(
      "La simulation prend du retard sur le temps réel (92 %)",
    );
    expect(viewOf(model, "en").warning?.text).toBe(
      "The simulation is falling behind real time (92%)",
    );
    const almost = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio: 0.9795 }));
    expect(viewOf(almost).warning?.text).toContain("(97%)");
  });

  it("explains in the tooltip why it matters with a PLC", () => {
    const model = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio: 0.5 }));
    expect(viewOf(model).warning?.tooltip).toContain("PLC");
  });

  it("warns when the dropped steps grew since the previous clock event, without a ratio", () => {
    const first = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio: null }));
    const grown = clockAfterClockState(first, stateOf({ achievedRatio: null, droppedSteps: 4 }));
    expect(viewOf(first).warning).toBeNull();
    expect(viewOf(grown).warning?.text).toBe("The simulation is falling behind real time");
  });

  it("does not warn for dropped steps counted before the first clock event", () => {
    const model = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ droppedSteps: 40 }));
    expect(viewOf(model).warning).toBeNull();
  });

  it("clears at the next clock event with a good ratio and no new drop", () => {
    const first = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf());
    const grown = clockAfterClockState(first, stateOf({ droppedSteps: 4 }));
    const steady = clockAfterClockState(grown, stateOf({ droppedSteps: 4 }));
    expect([viewOf(grown).warning !== null, viewOf(steady).warning]).toEqual([true, null]);
  });

  it("is kept by a pose, which says nothing about the ratio", () => {
    const behind = clockAfterClockState(INITIAL_CLOCK_MODEL, stateOf({ achievedRatio: 0.5 }));
    expect(viewOf(clockAfterPose(behind, 99)).warning).not.toBeNull();
  });
});
