import type { CreateJointRequest } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  documentOf,
  expectSamePoses,
  joint,
} from "../test-support/placed-fixtures.ts";
import { moveBody } from "./assembly-edits.ts";
import {
  addJointToDocument,
  deleteJointFromDocument,
  updateJointInDocument,
} from "./joint-rules.ts";
import { computePoses } from "./kinematics.ts";

// Edits keep the displayed pose, displacements included (ADR 0033 points 6
// and 7). Every assembly and the moved body carry a rotated, translated
// placement so that a wrong frame shows.

const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: "frame",
  child: "carriage",
  axis: [1, 0, 0],
  limits: [0, 1],
});
// main: frame, carriage (slid by `slide`); chape: clevis, rod; tail: pin,
// hung from the clevis by a revolute joint.
const CLEVIS_ON_CARRIAGE = joint({
  id: "mount",
  type: "fixed",
  parent: "carriage",
  child: "clevis",
});
const PIN_ON_CLEVIS = joint({ id: "hinge", parent: "clevis", child: "pin", origin: [0.2, 0, 0.1] });

// Bodies of the clevis subtree keep their pose; a body of the assembly outside
// it may shift (keep-displayed-pose.ts), so the fixtures hang the rod on it.
const ROD_ON_CLEVIS = joint({ id: "rod-mount", type: "fixed", parent: "clevis", child: "rod" });

const POSITIONS = new Map([
  ["slide", 0.3],
  ["hinge", 0.6],
]);

const DEFAULT_JOINTS = [SLIDE, PIN_ON_CLEVIS, ROD_ON_CLEVIS];
const REQUEST_MOUNT: CreateJointRequest = {
  type: "fixed",
  name: "mount",
  parent: "carriage",
  child: "clevis",
  origin: [0.1, 0.2, 0.3],
  axis: [0, 0, 1],
};

describe("joints between assemblies keep the displayed pose", () => {
  it("creating one keeps the child, the displaced parent and what hangs below", () => {
    const before = documentOf(DEFAULT_JOINTS);
    const { document } = addJointToDocument(before, REQUEST_MOUNT, POSITIONS);
    expectSamePoses(document, before, POSITIONS);
    expect(document.assemblies.find((item) => item.key === "chape")?.placement).not.toEqual(
      ABOUT_X,
    );
    expect(document.assemblies.find((item) => item.key === "tail")?.placement).toEqual(
      ABOUT_DIAGONAL,
    );
  });

  it("deleting one keeps the child where it was", () => {
    const before = documentOf([SLIDE, CLEVIS_ON_CARRIAGE, PIN_ON_CLEVIS, ROD_ON_CLEVIS]);
    const document = deleteJointFromDocument(before, "mount", POSITIONS);
    expectSamePoses(document, before, POSITIONS);
  });

  it("changing the parent re-anchors without movement", () => {
    const before = documentOf([SLIDE, CLEVIS_ON_CARRIAGE, PIN_ON_CLEVIS, ROD_ON_CLEVIS]);
    const { document } = updateJointInDocument(
      before,
      "mount",
      { ...REQUEST_MOUNT, parent: "frame" },
      POSITIONS,
    );
    expectSamePoses(document, before, POSITIONS);
  });
});

describe("a joint edit at rest", () => {
  it("moves nothing, a sibling root body of the assembly included", () => {
    // rod hangs from nothing: only a zero displacement keeps it in place.
    const before = documentOf([SLIDE]);
    const { document } = addJointToDocument(before, REQUEST_MOUNT, new Map());
    expectSamePoses(document, before, new Map());
  });
});

describe("a plain joint edit", () => {
  it("a plain origin edit still moves the child", () => {
    const hinge = joint({ id: "mount", parent: "carriage", child: "clevis" });
    const before = documentOf([SLIDE, hinge]);
    const positions = new Map([["mount", 0.5]]);
    const { document } = updateJointInDocument(
      before,
      "mount",
      {
        type: "revolute",
        name: "mount",
        parent: "carriage",
        child: "clevis",
        origin: [0.5, 0.2, 0.3],
        axis: [0, 0, 1],
        limits: [-Math.PI, Math.PI],
      },
      positions,
    );
    expect(document.assemblies).toEqual(before.assemblies);
    const moved = computePoses(document, positions).find((pose) => pose.bodyId === "clevis");
    const was = computePoses(before, positions).find((pose) => pose.bodyId === "clevis");
    expect(
      Math.hypot(
        ...(moved?.translation ?? [0, 0, 0]).map((v, i) => v - (was?.translation[i] ?? 0)),
      ),
    ).toBeGreaterThan(0.01);
  });
});

describe("anchor refusals", () => {
  it("names the joint already anchoring the assembly", () => {
    const before = documentOf([SLIDE, CLEVIS_ON_CARRIAGE]);
    const second = { ...REQUEST_MOUNT, name: "other", parent: "frame", child: "rod" };
    expect(() => addJointToDocument(before, second, POSITIONS)).toThrow(
      'Assembly "chape" is already anchored by joint "mount" (to assembly "main"). Delete or change that joint first.',
    );
  });

  it("refuses a loop of anchors on update and on body move", () => {
    const before = documentOf([SLIDE, CLEVIS_ON_CARRIAGE]);
    const back = { ...REQUEST_MOUNT, name: "back", parent: "rod", child: "frame" };
    expect(() => addJointToDocument(before, back, POSITIONS)).toThrow("loop");
    const apart = documentOf([
      SLIDE,
      joint({ id: "j", type: "fixed", parent: "rod", child: "frame" }),
    ]);
    expect(() => moveBody(apart, "frame", "chape")).not.toThrow();
    expect(() =>
      moveBody(
        documentOf([
          SLIDE,
          CLEVIS_ON_CARRIAGE,
          joint({ id: "j", type: "fixed", parent: "rod", child: "pin" }),
        ]),
        "pin",
        "main",
      ),
    ).toThrow("already anchored");
  });
});
