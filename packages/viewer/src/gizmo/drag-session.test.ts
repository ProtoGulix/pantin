import { describe, expect, it } from "vitest";
import { multiplyQuaternions } from "../frames.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import { gizmoNodeFrame } from "./anchor-frame.ts";
import { startDragSession } from "./drag-session.ts";
import { DEFAULT_SNAP_STEPS } from "./placement-snapping.ts";

function aboutAxis(axis: 0 | 1 | 2, degrees: number): RigidTransform["rotation"] {
  const half = (degrees * Math.PI) / 360;
  const parts: [number, number, number, number] = [0, 0, 0, Math.cos(half)];
  parts[axis] = Math.sin(half);
  return parts;
}

const quarterTurnZ: RigidTransform["rotation"] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
// An anchor turned a quarter turn: the anchor's X axis is the world's Y axis.
const anchor: RigidTransform = { translation: [1, 0, 0], rotation: quarterTurnZ };
const start: RigidTransform = { translation: [0.1, 0.2, 0], rotation: [0, 0, 0, 1] };

describe("a drag session", () => {
  const origin = gizmoNodeFrame(anchor, start);

  const along = (axis: 0 | 1 | 2, metres: number): RigidTransform => {
    const translation: [number, number, number] = [...origin.translation];
    translation[axis] += metres;
    return { translation, rotation: origin.rotation };
  };

  it("rounds the dragged distance in the anchor frame, on its axis only", () => {
    const session = startDragSession("move", anchor, start, DEFAULT_SNAP_STEPS);
    // 12.34 mm along the anchor's X axis = along the world's Y axis.
    const placement = session.placementOf(along(1, 0.01234), true);
    expect(placement.translation[0]).toBeCloseTo(0.112, 12);
    expect(placement.translation[1]).toBe(0.2);
    expect(placement.rotation).toBe(start.rotation);
  });

  it("keeps an off-grid value on an axis the drag did not touch", () => {
    const offGrid: RigidTransform = { translation: [0.1, 0.0003, 0], rotation: [0, 0, 0, 1] };
    const identity: RigidTransform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const session = startDragSession("move", identity, offGrid, DEFAULT_SNAP_STEPS);
    const node = gizmoNodeFrame(identity, offGrid);
    const placement = session.placementOf(
      {
        translation: [node.translation[0] + 0.0204, node.translation[1] + 2e-7, 0],
        rotation: node.rotation,
      },
      true,
    );
    expect(placement.translation[0]).toBeCloseTo(0.12, 12);
    expect(placement.translation[1]).toBe(0.0003);
  });

  it("does not round while Ctrl is held", () => {
    const session = startDragSession("move", anchor, start, DEFAULT_SNAP_STEPS);
    expect(session.placementOf(along(1, 0.01234), false).translation[0]).toBeCloseTo(0.11234, 12);
  });

  it("keeps the start position exactly while turning", () => {
    const session = startDragSession("rotate", anchor, start, DEFAULT_SNAP_STEPS);
    const placement = session.placementOf(
      {
        translation: [origin.translation[0] + 1e-9, origin.translation[1], origin.translation[2]],
        rotation: multiplyQuaternions(anchor.rotation, aboutAxis(2, 20)),
      },
      true,
    );
    expect(placement.translation).toBe(start.translation);
    // 20 degrees rounds to 15.
    expect(placement.rotation[2]).toBeCloseTo(Math.sin((15 * Math.PI) / 360), 9);
  });

  it("keeps the placement of the start for Escape, whatever was dragged", () => {
    const session = startDragSession("move", anchor, start, DEFAULT_SNAP_STEPS);
    session.placementOf(along(0, 5), true);
    expect(session.startPlacement).toBe(start);
  });
});

// The reviewer's cases: the start rotation is 30 degrees about Y.
describe("a ring drag from a rotated start", () => {
  const identity: RigidTransform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
  const turnedY: RigidTransform = { translation: [0, 0, 0], rotation: aboutAxis(1, 30) };
  const node = gizmoNodeFrame(identity, turnedY);

  it.each([15, 45])("sends exactly Rx(%i) . R0, not re-rounded angles", (degrees) => {
    const session = startDragSession("rotate", identity, turnedY, DEFAULT_SNAP_STEPS);
    // The gizmo's float noise on the angle and on another component.
    const noisy = multiplyQuaternions(node.rotation, aboutAxis(0, degrees + 0.02));
    const placement = session.placementOf({ translation: node.translation, rotation: noisy }, true);
    const expected = multiplyQuaternions(aboutAxis(0, degrees), turnedY.rotation);
    placement.rotation.forEach((part, index) => {
      expect(part).toBeCloseTo(expected[index] ?? Number.NaN, 12);
    });
  });

  it("keeps an off-grid RZ of 7 degrees through an X ring drag", () => {
    const offGrid: RigidTransform = { translation: [0, 0, 0], rotation: aboutAxis(2, 7) };
    const session = startDragSession("rotate", identity, offGrid, DEFAULT_SNAP_STEPS);
    const start = gizmoNodeFrame(identity, offGrid);
    const placement = session.placementOf(
      {
        translation: start.translation,
        rotation: multiplyQuaternions(start.rotation, aboutAxis(0, 15)),
      },
      true,
    );
    const expected = multiplyQuaternions(aboutAxis(0, 15), aboutAxis(2, 7));
    placement.rotation.forEach((part, index) => {
      expect(part).toBeCloseTo(expected[index] ?? Number.NaN, 12);
    });
  });
});
