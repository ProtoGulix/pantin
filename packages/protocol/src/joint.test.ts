import { describe, expect, it } from "vitest";
import { CreateJointRequestSchema, JOINT_PARAMETERS, JointSchema } from "./joint.ts";
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
  it("accepts every joint type", () => {
    const { limits: _limits, ...withoutLimits } = slide;
    for (const joint of [
      slide,
      { ...slide, type: "revolute", limits: [-1.5, 1.5] },
      { ...withoutLimits, type: "fixed" },
      { ...withoutLimits, type: "continuous" },
      { ...slide, type: "helical", pitch: 0.005 },
      { ...slide, type: "helical", pitch: -0.005 },
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
    ["a helical joint without pitch", { ...slide, type: "helical" }],
    ["a helical joint with a zero pitch", { ...slide, type: "helical", pitch: 0 }],
    ["a helical joint with an infinite pitch", { ...slide, type: "helical", pitch: Infinity }],
    ["a helical joint with a vanishing pitch", { ...slide, type: "helical", pitch: 1e-320 }],
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

describe("JOINT_PARAMETERS", () => {
  it.each(CreateJointRequestSchema.options)("names real fields of $shape.type.value", (schema) => {
    const type = schema.shape.type.value;
    for (const parameter of JOINT_PARAMETERS[type]) {
      expect(Object.keys(schema.shape)).toContain(parameter.field);
    }
  });

  it("declares limits as a coordinate range exactly for the types that have limits", () => {
    for (const schema of CreateJointRequestSchema.options) {
      const declaresLimits = JOINT_PARAMETERS[schema.shape.type.value].some(
        (parameter) => parameter.field === "limits" && parameter.kind === "coordinateRange",
      );
      expect(declaresLimits).toBe("limits" in schema.shape);
    }
  });
});
