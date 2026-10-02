import { ALIGNMENT_KINDS, type AlignmentKind } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { apply, normalize, type RigidTransform, rotate } from "../rigid-transform.ts";
import type { ConnectorFrame } from "./geometry.ts";
import type { AlignmentParameters } from "./motion.ts";
import { ALIGNMENT_MOTIONS } from "./registry.ts";

// Invariants every alignment kind must keep (ADR 0035 point 9). A new kind
// only adds its examples here; the compiler asks for them.

const NO_PARAMETERS: AlignmentParameters = { flip: false, offset: 0, rotation: 0 };

function frame(origin: ConnectorFrame["origin"], direction: ConnectorFrame["direction"]) {
  return { origin, direction: normalize(direction) };
}

type Examples<Kind extends AlignmentKind> = {
  kind: Kind;
  aligned: ConnectorFrame[];
  misaligned: ConnectorFrame[];
};

const EXAMPLES: { readonly [Kind in AlignmentKind]: Examples<Kind> } = {
  plane_on_plane: {
    kind: "plane_on_plane",
    aligned: [frame([0.3, 0.1, 0.05], [0, 0, -1]), frame([0, 0, 0.05], [0, 0, 1])],
    misaligned: [frame([1, 2, 3], [0.2, -0.5, 0.7]), frame([0.1, 0, 0.05], [0, 0, 1])],
  },
  axis_on_axis: {
    kind: "axis_on_axis",
    aligned: [frame([0.02, 0.015, 0.3], [0, 0, -1]), frame([0.02, 0.015, 0], [0, 0, 1])],
    misaligned: [frame([1, -2, 0.5], [1, 1, 0.2]), frame([0.02, 0.015, 0], [0, 0, 1])],
  },
  axis_around_pivot: {
    kind: "axis_around_pivot",
    aligned: [
      frame([0, 0, 0], [0, 0, 1]),
      frame([0.04, 0, 0.01], [0, 0, -1]),
      frame([0.04, 0, 0], [0, 0, 1]),
    ],
    misaligned: [
      frame([0, 0, 0], [0, 0, 1]),
      frame([0, 0.04, 0.01], [0, 0, 1]),
      frame([0.04, 0, 0], [0, 0, 1]),
    ],
  },
};

function moved(kind: AlignmentKind, frames: ConnectorFrame[], motion: RigidTransform) {
  return frames.map((connector, index) =>
    ALIGNMENT_KINDS[kind].picks[index]?.side === "moving"
      ? {
          origin: apply(motion, connector.origin),
          direction: rotate(motion.rotation, connector.direction),
        }
      : connector,
  );
}

function expectIdentity(motion: RigidTransform): void {
  const [x, y, z, w] = motion.rotation;
  expect(Math.abs(w)).toBeCloseTo(1, 9);
  for (const value of [x, y, z, ...motion.translation]) {
    expect(value).toBeCloseTo(0, 9);
  }
}

describe.each(Object.values(EXAMPLES))("alignment kind $kind", ({ kind, aligned, misaligned }) => {
  const motionOf = ALIGNMENT_MOTIONS[kind];

  it("gives one frame per pick of its descriptor in its examples", () => {
    expect(aligned).toHaveLength(ALIGNMENT_KINDS[kind].picks.length);
    expect(misaligned).toHaveLength(ALIGNMENT_KINDS[kind].picks.length);
  });

  it("leaves an aligned configuration where it is", () => {
    expectIdentity(motionOf(aligned, NO_PARAMETERS));
  });

  it("gives a rigid motion after which nothing is left to align", () => {
    const motion = motionOf(misaligned, NO_PARAMETERS);
    expect(Math.hypot(...motion.rotation)).toBeCloseTo(1, 12);
    expectIdentity(motionOf(moved(kind, misaligned, motion), NO_PARAMETERS));
  });
});
