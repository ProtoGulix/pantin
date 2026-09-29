import { describe, expect, it } from "vitest";
import { CreateJointRequestSchema, JointSchema } from "./joint.ts";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

function body(id: string) {
  return {
    id,
    name: id,
    source: { fileName: "axis.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

const slide = {
  id: "stroke",
  name: "Stroke",
  type: "prismatic",
  parent: "rail",
  child: "carriage",
  origin: [-0.4, 0, 0.02],
  axis: [1, 0, 0],
  limits: [0, 0.8],
};

function documentWith(joints: unknown[], bodyIds = ["rail", "carriage", "tool"]) {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Axis",
    bodies: bodyIds.map(body),
    joints,
  };
}

describe("JointSchema", () => {
  it("accepts the four joint types", () => {
    const { limits: _limits, ...withoutLimits } = slide;
    for (const joint of [
      slide,
      { ...slide, type: "revolute", limits: [-1.5, 1.5] },
      { ...withoutLimits, type: "fixed" },
      { ...withoutLimits, type: "continuous" },
    ]) {
      expect(JointSchema.safeParse(joint).success).toBe(true);
    }
  });

  it.each([
    ["a zero axis", { ...slide, axis: [0, 0, 0] }],
    ["reversed limits", { ...slide, limits: [0.8, 0] }],
    ["an infinite origin", { ...slide, origin: [Number.POSITIVE_INFINITY, 0, 0] }],
    ["a prismatic joint without limits", { ...slide, limits: undefined }],
    ["an unknown type", { ...slide, type: "ball" }],
  ])("rejects %s", (_label, joint) => {
    expect(JointSchema.safeParse(joint).success).toBe(false);
  });

  it("parses a creation request without id", () => {
    const { id: _id, ...request } = slide;
    expect(CreateJointRequestSchema.parse(request)).toEqual(request);
  });
});

describe("PantinDocumentSchema joints", () => {
  it("accepts a chain of joints", () => {
    const tool = { ...slide, id: "tool-mount", type: "fixed", parent: "carriage", child: "tool" };
    expect(PantinDocumentSchema.safeParse(documentWith([slide, tool])).success).toBe(true);
  });

  it.each([
    ["an unknown body", [{ ...slide, child: "ghost" }]],
    ["a body linked to itself", [{ ...slide, child: "rail" }]],
    ["two parents for one body", [slide, { ...slide, id: "second", parent: "tool" }]],
    ["a cycle", [slide, { ...slide, id: "back", parent: "carriage", child: "rail" }]],
    ["two joints with the same id", [slide, { ...slide, child: "tool" }]],
  ])("rejects %s", (_label, joints) => {
    expect(PantinDocumentSchema.safeParse(documentWith(joints)).success).toBe(false);
  });
});
