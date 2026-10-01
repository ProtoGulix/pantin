import type { SimulationClockState } from "@pantin/protocol";
import { type Language, pluralKey, type Translate } from "../i18n/translate.ts";

// The transport bar's model (ADR 0032 points 10 to 12): the clock events in,
// what the bar shows out. Simulated time is the core's: the viewer only
// multiplies the latest step by the step duration, for display, and never
// reads its own clock to advance it (CLAUDE.md section 3.2).

export interface ClockModel {
  // The latest clock event or REST answer; null until the first one.
  readonly state: SimulationClockState | null;
  // The latest step from a pose or a clock event, whichever came last.
  readonly step: number;
  // The warning of ADR 0032 point 11, decided at each clock event.
  readonly behind: boolean;
}

export const INITIAL_CLOCK_MODEL: ClockModel = { state: null, step: 0, behind: false };

// Below this share of the due steps, the simulation lags (ADR 0032 point 11).
const MIN_ACHIEVED_RATIO = 0.98;

export function clockAfterPose(model: ClockModel, stepCount: number): ClockModel {
  return model.step === stepCount ? model : { ...model, step: stepCount };
}

/** A clock event of the stream or the answer of a clock request. */
export function clockAfterClockState(model: ClockModel, state: SimulationClockState): ClockModel {
  const droppedMore = model.state !== null && state.droppedSteps > model.state.droppedSteps;
  const slow = state.achievedRatio !== null && state.achievedRatio < MIN_ACHIEVED_RATIO;
  return { state, step: state.step, behind: slow || droppedMore };
}

interface ClockWarningView {
  text: string;
  tooltip: string;
}

export interface ClockView {
  // The bar is shown while a Pantin is open.
  visible: boolean;
  running: boolean;
  barLabel: string;
  toggleLabel: string;
  toggleHint: string;
  // Nothing to command before the first clock state arrives.
  canToggle: boolean;
  canStep: boolean;
  stepOneLabel: string;
  stepOneHint: string;
  stepTenLabel: string;
  stepTenHint: string;
  timeLabel: string;
  timeText: string;
  stepLabel: string;
  stepText: string;
  warning: ClockWarningView | null;
}

/** Seconds with milliseconds, in the language's decimal separator: 1234 steps of 1/120 s read "10,283". */
export function formatSimulatedSeconds(step: number, stepSeconds: number, language: Language) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(step * stepSeconds);
}

// Rounded down: 97.9 % is below the threshold and must not read "98 %".
function ratioPercent(ratio: number): number {
  return Math.floor(ratio * 100);
}

function warningView(state: SimulationClockState, t: Translate): ClockWarningView {
  const ratio = state.achievedRatio;
  return {
    text:
      ratio === null
        ? t("clock.warning.dropped")
        : t("clock.warning", { ratio: ratioPercent(ratio) }),
    tooltip: t("clock.warning.hint"),
  };
}

export function buildClockView(
  model: ClockModel,
  visible: boolean,
  language: Language,
  t: Translate,
): ClockView {
  const { state } = model;
  const running = state?.running ?? false;
  return {
    visible,
    running,
    barLabel: t("clock.label"),
    toggleLabel: t(running ? "clock.pause" : "clock.run"),
    toggleHint: t(running ? "clock.pauseHint" : "clock.runHint"),
    canToggle: state !== null,
    canStep: state !== null && !running,
    stepOneLabel: t("clock.stepOne"),
    stepOneHint: t(pluralKey("clock.stepHint", 1, language), { count: 1 }),
    stepTenLabel: t("clock.stepTen"),
    stepTenHint: t(pluralKey("clock.stepHint", 10, language), { count: 10 }),
    timeLabel: t("clock.timeLabel"),
    timeText:
      state === null
        ? t("clock.time.unknown")
        : t("clock.time", {
            seconds: formatSimulatedSeconds(model.step, state.stepSeconds, language),
          }),
    stepLabel: t("clock.stepLabel"),
    stepText: t(pluralKey("clock.step", model.step, language), { count: model.step }),
    warning: model.behind && state !== null ? warningView(state, t) : null,
  };
}
