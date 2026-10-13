import type { Joint, Placement } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  assemblyFrameTargetOf,
  displayedAssemblyFrame,
  frameTargetOfAssembly,
} from "./assembly-frame.ts";
import { initialJointForm } from "./joints/joint-form.ts";
import { invertTransform, type RigidTransform } from "./rigid-transform.ts";
import { nodeSelection } from "./selection.ts";
import { hingeJoint, pantinResponse, railBody, stepBody } from "./test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, jointNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "./viewer-state.ts";

const IDENTITY: RigidTransform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const H = Math.SQRT1_2;
// 90 degrees about core Z.
const QUARTER_Z: RigidTransform = { translation: [1, 2, 3], rotation: [0, 0, H, H] };

function expectClose(actual: RigidTransform, expected: RigidTransform): void {
  expect([...actual.translation, ...actual.rotation]).toEqual(
    [...expected.translation, ...expected.rotation].map((value) => expect.closeTo(value, 9)),
  );
}

describe("displayedAssemblyFrame", () => {
  it("is the identity for an identity pose and no placement", () => {
    expectClose(displayedAssemblyFrame(IDENTITY, undefined), IDENTITY);
  });

  it("is the pose itself without a body placement", () => {
    expect(displayedAssemblyFrame(QUARTER_Z, undefined)).toBe(QUARTER_Z);
  });

  it("is the assembly frame when the placement is its inverse and the pose the identity", () => {
    // The 70 degree cylinder: pose = W . B = identity, B = W^-1.
    const half = (70 * Math.PI) / 360;
    const frame: RigidTransform = {
      translation: [0.5, 0, 0.2],
      rotation: [Math.sin(half), 0, 0, Math.cos(half)],
    };
    const inverse = invertTransform(frame);
    expectClose(displayedAssemblyFrame(IDENTITY, inverse), frame);
  });

  it("composes the pose with the inverse placement", () => {
    const placement: RigidTransform = { translation: [0, 0, 0], rotation: [0, 0, H, H] };
    // pose . B^-1: a quarter turn undone, then the pose's translation.
    expectClose(
      displayedAssemblyFrame({ translation: [1, 2, 3], rotation: [0, 0, H, H] }, placement),
      {
        translation: [1, 2, 3],
        rotation: [0, 0, 0, 1],
      },
    );
  });
});

const bodies = [
  railBody,
  stepBody("carriage", "N_1"),
  { ...stepBody("lone", "N_2"), assembly: "empty" },
];
const opened: ViewerState = withOpenPantin(
  initialViewerState("en"),
  pantinResponse(false, bodies, "press", [hingeJoint]),
);
const select = (nodeId: string): ViewerState => ({ ...opened, selection: nodeSelection(nodeId) });

describe("assemblyFrameTargetOf", () => {
  it("shows the selected assembly, read from its first body", () => {
    expect(assemblyFrameTargetOf(select(assemblyNodeId("press", "main")))).toEqual({
      assemblyKey: "main",
      bodyId: "rail",
      bodyPlacement: undefined,
    });
  });

  it("shows the parent body's assembly for a joint", () => {
    expect(assemblyFrameTargetOf(select(jointNodeId("press", "hinge")))?.assemblyKey).toBe("main");
  });

  it("follows the parent body itself for a joint, even one moved by an internal joint", () => {
    const slider: Joint = {
      ...hingeJoint,
      id: "slide",
      parent: "rail",
      child: "carriage",
      type: "prismatic",
      limits: [0, 0.2],
    };
    const state = withOpenPantin(
      initialViewerState("en"),
      pantinResponse(false, [railBody, stepBody("carriage", "N_1")], "press", [
        slider,
        { ...hingeJoint, id: "next", parent: "carriage", child: "tip" },
      ]),
    );
    const target = assemblyFrameTargetOf({
      ...state,
      selection: nodeSelection(jointNodeId("press", "next")),
    });
    expect(target?.bodyId).toBe("carriage");
  });

  it("shows the parent body's assembly for the joint form", () => {
    const jointForm = initialJointForm(bodies);
    expect(assemblyFrameTargetOf({ ...opened, jointForm })?.assemblyKey).toBe("main");
  });

  it("shows nothing for a body, the Pantin, nothing selected or no open Pantin", () => {
    expect(assemblyFrameTargetOf(select(bodyNodeId("press", "rail")))).toBeNull();
    expect(assemblyFrameTargetOf(select(pantinNodeId("press")))).toBeNull();
    expect(assemblyFrameTargetOf(opened)).toBeNull();
    expect(assemblyFrameTargetOf(initialViewerState("en"))).toBeNull();
  });

  it("shows nothing for another Pantin's assembly", () => {
    expect(assemblyFrameTargetOf(select(assemblyNodeId("robot", "main")))).toBeNull();
  });
});

describe("frameTargetOfAssembly", () => {
  it("is null for an assembly without body", () => {
    expect(frameTargetOfAssembly({ bodies, joints: [] }, "ghost")).toBeNull();
  });

  it("carries the body placement", () => {
    const placement: Placement = { translation: [1, 2, 3], rotation: [0, 0, H, H] };
    const placed = { ...railBody, placement };
    expect(frameTargetOfAssembly({ bodies: [placed], joints: [] }, "main")?.bodyPlacement).toBe(
      placement,
    );
  });

  it("takes the root body, not a body moved by an internal joint", () => {
    const slider: Joint = {
      ...hingeJoint,
      id: "slide",
      parent: "rod",
      child: "cyl",
      type: "prismatic",
      limits: [0, 0.2],
    };
    // "cyl" comes first in document order but is the child of the internal slider.
    const inOrder = [
      { ...stepBody("cyl", "N_4"), assembly: "main" },
      { ...stepBody("rod", "N_3"), assembly: "main" },
    ];
    expect(frameTargetOfAssembly({ bodies: inOrder, joints: [slider] }, "main")?.bodyId).toBe(
      "rod",
    );
  });

  it("prefers the anchor child over a jointless body listed before it", () => {
    // "free" has no joint and stays at W; "rail" rides the joint from "lone".
    const inOrder = [{ ...stepBody("free", "N_9"), assembly: "main" }, ...bodies];
    const between = { ...hingeJoint, parent: "lone", child: "rail" };
    expect(frameTargetOfAssembly({ bodies: inOrder, joints: [between] }, "main")?.bodyId).toBe(
      "rail",
    );
  });

  it("keeps a body whose incoming joint comes from another assembly", () => {
    const between = { ...hingeJoint, parent: "lone", child: "rail" };
    expect(frameTargetOfAssembly({ bodies, joints: [between] }, "main")?.bodyId).toBe("rail");
  });
});
