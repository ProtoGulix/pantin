import { describe, expect, it } from "vitest";
import { conveyorLine, photoelectricCell } from "../test-support/conveyor-fixtures.ts";
import { frameResolver } from "./physics-frames.ts";
import { emptyPhysicsState } from "./physics-state.ts";
import { evaluatePresence, presenceRays } from "./presence-step.ts";

describe("presenceRays", () => {
  const document = conveyorLine({
    presenceSensors: [
      photoelectricCell({
        id: "zeta",
        tagKey: "zeta",
        range: 0.2,
        placement: { translation: [1, 2, 3], rotation: [0, 0, 0, 1] },
      }),
      photoelectricCell({ id: "alpha", tagKey: "alpha", range: 0.7 }),
    ],
  });

  it("makes one ray per sensor in id order, from the frame origin along its +Z", () => {
    const { sensors, rays } = presenceRays(document, frameResolver(document, new Map()));
    expect(sensors.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
    expect(rays).toEqual([
      { origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 0.7 },
      { origin: [1, 2, 3], direction: [0, 0, 1], maxDistance: 0.2 },
    ]);
  });

  it("turns hits into outputs, a distance of 0 counting as a hit", () => {
    const presence = presenceRays(document, frameResolver(document, new Map()));
    const next = evaluatePresence(emptyPhysicsState(), presence, [0, null]);
    expect(next.presenceOutputs.get("alpha")).toEqual({ state: 1 });
    expect(next.presenceOutputs.get("zeta")).toEqual({ state: 0 });
  });
});
