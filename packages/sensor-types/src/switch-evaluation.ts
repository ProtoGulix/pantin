import type { SensorOutput } from "./evaluation-common.ts";
import { FULL_TURN } from "./schema-common.ts";
import type { Interval } from "./switch-zones.ts";
import type { SwitchOf } from "./zones.ts";

// The one evaluation of every switch (ADR 0025 point 2): an off switch turns
// on inside its on zone; an on switch stays on inside its hold zone, which
// is the hysteresis. Before the first step there is no history: the on zone
// alone decides. On a joint without end stops the angle counts within one
// turn, so a zone may be written from −10° to 10° (ADR 0026 point 3).

const inside = ([lower, upper]: Interval, position: number) =>
  position >= lower && position <= upper;

function insideWithinOneTurn(zone: Interval, angle: number): boolean {
  const [lower] = zone;
  if (!Number.isFinite(lower)) {
    return inside(zone, angle);
  }
  // The same angle, brought into the turn that starts at the zone's lower bound.
  const turns = Math.floor((angle - lower) / FULL_TURN);
  return inside(zone, angle - turns * FULL_TURN);
}

export function evaluateSwitch(
  { zones, normallyClosed, withinOneTurn }: SwitchOf,
  position: number,
  state: Readonly<Record<string, number>> | null,
): SensorOutput {
  const wasOn = state?.actuated === 1;
  const zone = wasOn ? zones.hold : zones.on;
  const actuated = withinOneTurn ? insideWithinOneTurn(zone, position) : inside(zone, position);
  return {
    // The state keeps the physical actuation; the output reads it through the contact type.
    values: { state: actuated !== normallyClosed ? 1 : 0 },
    state: { actuated: actuated ? 1 : 0 },
  };
}
