import { describe, expect, it } from "vitest";
import type { RigidTransform } from "../rigid-transform.ts";
import { rotateVector } from "../rigid-transform.ts";
import { gizmoNodeFrame, placementOfGizmoNode } from "./anchor-frame.ts";
import { startDragSession } from "./drag-session.ts";
import { parseStoredGizmoSpace } from "./gizmo-space.ts";
import { DEFAULT_SNAP_STEPS } from "./placement-snapping.ts";

// The Local gizmo (ADR 0042 point 2): the node is turned like the assembly, the
// placement sent is still in the anchor frame, snapped along the gizmo's axes.

const half = (70 * Math.PI) / 360;
const aboutY70: RigidTransform["rotation"] = [0, Math.sin(half), 0, Math.cos(half)];
const identity: RigidTransform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const tilted: RigidTransform = { translation: [0.1, 0.2, 0.3], rotation: aboutY70 };
const steps = { ...DEFAULT_SNAP_STEPS, rotationDegrees: 15 };

describe("the local gizmo node", () => {
  it("is turned like the assembly in Local and like the anchor in Global", () => {
    const anchor: RigidTransform = {
      translation: [1, 0, 0],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    };
    const local = gizmoNodeFrame(anchor, tilted, "local");
    const global = gizmoNodeFrame(anchor, tilted, "global");
    expect(local.translation).toEqual(global.translation);
    expect(global.rotation).toEqual(anchor.rotation);
    // Its X axis is the assembly's X axis, seen from the world.
    const x = rotateVector(local.rotation, [1, 0, 0]);
    const expected = rotateVector(anchor.rotation, rotateVector(aboutY70, [1, 0, 0]));
    expect(x[0]).toBeCloseTo(expected[0], 12);
    expect(x[1]).toBeCloseTo(expected[1], 12);
    expect(x[2]).toBeCloseTo(expected[2], 12);
  });

  it("gives the start placement back for the node left where it started", () => {
    const start = gizmoNodeFrame(identity, tilted, "local");
    const placement = placementOfGizmoNode(identity, tilted, start, "local");
    expect(placement.translation).toEqual(tilted.translation);
    placement.rotation.forEach((part, index) => {
      expect(part).toBeCloseTo(tilted.rotation[index] ?? 0, 12);
    });
  });
});

describe("a Local drag on an assembly turned 70 degrees about Y", () => {
  const node = gizmoNodeFrame(identity, tilted, "local");

  it("moves 10 mm along the assembly's X, expressed in the anchor frame", () => {
    const session = startDragSession("move", identity, tilted, steps, "local");
    const x = rotateVector(aboutY70, [0.01, 0, 0]);
    const moved = {
      translation: [
        node.translation[0] + x[0],
        node.translation[1] + x[1],
        node.translation[2] + x[2],
      ] as [number, number, number],
      rotation: node.rotation,
    };
    const { translation, rotation } = session.placementOf(moved, true);
    // 10 mm * (cos 70, 0, -sin 70) with the right-handed rotation about Y.
    expect((translation[0] - 0.1) * 1000).toBeCloseTo(3.42, 2);
    expect(translation[1]).toBe(0.2);
    expect((translation[2] - 0.3) * 1000).toBeCloseTo(-9.4, 2);
    expect(rotation).toBe(tilted.rotation);
  });

  it("snaps the distance along the gizmo's axis, not along the anchor's", () => {
    const session = startDragSession("move", identity, tilted, steps, "local");
    const x = rotateVector(aboutY70, [0.0123, 0, 0]);
    const moved = {
      translation: [
        node.translation[0] + x[0],
        node.translation[1] + x[1],
        node.translation[2] + x[2],
      ] as [number, number, number],
      rotation: node.rotation,
    };
    const { translation } = session.placementOf(moved, true);
    const sent = [translation[0] - 0.1, translation[1] - 0.2, translation[2] - 0.3];
    expect(Math.hypot(...sent) * 1000).toBeCloseTo(12, 9);
  });
});

describe("a Local rotation on an assembly turned 70 degrees about Y", () => {
  const node = gizmoNodeFrame(identity, tilted, "local");

  it("turns about the assembly's own Y by whole steps and keeps its position", () => {
    const session = startDragSession("rotate", identity, tilted, steps, "local");
    // 32 degrees about the node's own Y: the node's rotation times the turn.
    const turn = (32 * Math.PI) / 360;
    const own: [number, number, number, number] = [0, Math.sin(turn), 0, Math.cos(turn)];
    const [ax, ay, az, aw] = node.rotation;
    const [bx, by, bz, bw] = own;
    const turned: [number, number, number, number] = [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
    const placement = session.placementOf({ ...node, rotation: turned }, true);
    expect(placement.translation).toBe(tilted.translation);
    // 70 + 30 degrees about Y.
    const total = (100 * Math.PI) / 360;
    // Exactly 0: the stored rotation is R0 . s, with no conjugation noise.
    expect(placement.rotation[0]).toBe(0);
    expect(placement.rotation[2]).toBe(0);
    expect(placement.rotation[1]).toBeCloseTo(Math.sin(total), 12);
    expect(placement.rotation[3]).toBeCloseTo(Math.cos(total), 12);
  });
});

describe("a Local drag under a turned anchor", () => {
  const anchor: RigidTransform = {
    translation: [1, 2, 0],
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
  };
  const node = gizmoNodeFrame(anchor, tilted, "local");
  const dragged = (metres: number): RigidTransform => {
    // Along the node's own X axis, in the world.
    const x = rotateVector(node.rotation, [metres, 0, 0]);
    return {
      translation: [
        node.translation[0] + x[0],
        node.translation[1] + x[1],
        node.translation[2] + x[2],
      ],
      rotation: node.rotation,
    };
  };
  const along = (placement: RigidTransform): number[] =>
    placement.translation.map((value, index) => value - (tilted.translation[index] ?? 0));

  it("still sends the move along the assembly's X, in the anchor frame", () => {
    const session = startDragSession("move", anchor, tilted, steps, "local");
    const [dx = 0, dy = 0, dz = 0] = along(session.placementOf(dragged(0.01), true));
    expect(dx * 1000).toBeCloseTo(3.42, 2);
    expect(dy).toBeCloseTo(0, 12);
    expect(dz * 1000).toBeCloseTo(-9.4, 2);
  });

  it("does not round the distance while Ctrl is held", () => {
    const session = startDragSession("move", anchor, tilted, steps, "local");
    const sent = along(session.placementOf(dragged(0.0123), false));
    expect(Math.hypot(...sent) * 1000).toBeCloseTo(12.3, 9);
    expect(Math.hypot(...along(session.placementOf(dragged(0.0123), true))) * 1000).toBeCloseTo(
      12,
      9,
    );
  });
});

describe("the stored gizmo space", () => {
  it("defaults to Local when missing or corrupt", () => {
    expect(parseStoredGizmoSpace(null)).toBe("local");
    expect(parseStoredGizmoSpace("garbage")).toBe("local");
    expect(parseStoredGizmoSpace("global")).toBe("global");
    expect(parseStoredGizmoSpace("local")).toBe("local");
  });
});
