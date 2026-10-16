import type { PantinDocument } from "@pantin/protocol";
import { evaluatePresenceSensor } from "@pantin/sensor-types/evaluators";
import { STEP_SECONDS } from "./fixed-step.ts";
import type { FrameResolver } from "./physics-frames.ts";
import type { PhysicsState } from "./physics-state.ts";
import type { Ray } from "./physics-world.ts";
import { rotate } from "./rigid-transform.ts";

// Presence sensors at each step (ADR 0043 points 7, 8 and 10): one ray per
// sensor from its frame, cast once for all of them after the removals, then
// evaluated from the hits. Pure: the cast itself is the service's.

type PresenceSensor = PantinDocument["presenceSensors"][number];

export type PresenceRays = {
  sensors: readonly PresenceSensor[];
  // One per sensor, in the same order (document order is id order).
  rays: readonly Ray[];
};

const FRAME_Z: readonly [number, number, number] = [0, 0, 1];

// Both modes cast the same ray: they differ only in what a viewer draws.
export function presenceRays(document: PantinDocument, resolve: FrameResolver): PresenceRays {
  const sensors = [...document.presenceSensors].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const rays = sensors.map((sensor) => {
    const pose = resolve(sensor);
    return {
      origin: pose.translation,
      direction: rotate(pose.rotation, FRAME_Z),
      maxDistance: sensor.range,
    };
  });
  return { sensors, rays };
}

/** The state after this step: the hits (null: nothing seen) turned into outputs and states. */
export function evaluatePresence(
  state: PhysicsState,
  presence: PresenceRays,
  hits: readonly (number | null)[],
): PhysicsState {
  const presenceOutputs = new Map<string, Readonly<Record<string, number>>>();
  const presenceStates = new Map<string, Readonly<Record<string, number>>>();
  presence.sensors.forEach((sensor, index) => {
    const output = evaluatePresenceSensor({
      fields: sensor,
      signal: hits[index] !== null && hits[index] !== undefined,
      state: state.presenceStates.get(sensor.id) ?? null,
      stepSeconds: STEP_SECONDS,
    });
    presenceOutputs.set(sensor.id, output.values);
    presenceStates.set(sensor.id, output.state);
  });
  return { ...state, presenceOutputs, presenceStates };
}
