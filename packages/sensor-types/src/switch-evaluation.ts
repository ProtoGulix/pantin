import type { SensorOutput } from "./evaluation-common.ts";
import type { Interval } from "./switch-zones.ts";
import type { SwitchOf } from "./zones.ts";

// The one evaluation of every switch (ADR 0025 point 2): an off switch turns
// on inside its on zone; an on switch stays on inside its hold zone, which
// is the hysteresis. Before the first step there is no history: the on zone
// alone decides.

const inside = ([lower, upper]: Interval, position: number) =>
  position >= lower && position <= upper;

export function evaluateSwitch(
  { zones, normallyClosed }: SwitchOf,
  position: number,
  state: Readonly<Record<string, number>> | null,
): SensorOutput {
  const wasOn = state?.actuated === 1;
  const actuated = inside(wasOn ? zones.hold : zones.on, position);
  return {
    // The state keeps the physical actuation; the output reads it through the contact type.
    values: { state: actuated !== normallyClosed ? 1 : 0 },
    state: { actuated: actuated ? 1 : 0 },
  };
}
