import type { AcPowerState } from "./ports.ts";

/** The direction of a signed quantity, 0 when it is 0. */
export function directionOf(signed: number): AcPowerState["direction"] {
  if (signed > 0) {
    return 1;
  }
  if (signed < 0) {
    return -1;
  }
  return 0;
}

/** The `ac_power` state of a signed speed in percent of the nominal speed. */
export function acPowerOf(speedPercent: number): AcPowerState {
  return { direction: directionOf(speedPercent), ratio: Math.abs(speedPercent) / 100 };
}
