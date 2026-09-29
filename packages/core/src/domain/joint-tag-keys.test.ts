import {
  type Body,
  type CreateJointRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { addJointToDocument, updateJointInDocument } from "./joint-rules.ts";

// Tag keys of joints (ADR 0019 point 5): derived from the name at creation,
// unique among the joints whose child is in the same assembly, kept by every
// later update.

function body(id: string, assembly: string): Body {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "cylinder.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

const TWO_CYLINDERS: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [
    { key: "pince", name: "Pince" },
    { key: "levage", name: "Levage" },
  ],
  bodies: [
    body("body-1", "pince"),
    body("rod-1", "pince"),
    body("stop-1", "pince"),
    body("body-2", "levage"),
    body("rod-2", "levage"),
  ],
  joints: [],
};

function rod(parent: string, child: string, name = "Tige"): CreateJointRequest {
  return {
    type: "prismatic",
    name,
    parent,
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  };
}

const withFirstRod = addJointToDocument(TWO_CYLINDERS, rod("body-1", "rod-1")).document;

describe("joint tag keys", () => {
  it("gives the same tag key to joints in two assemblies, and different ids", () => {
    const second = addJointToDocument(withFirstRod, rod("body-2", "rod-2"));
    expect(second.document.joints.map(({ id, tagKey }) => [id, tagKey])).toEqual([
      ["tige", "tige"],
      ["tige-2", "tige"],
    ]);
  });

  it("makes the tag key unique inside one assembly", () => {
    const again = addJointToDocument(withFirstRod, rod("body-1", "stop-1"));
    expect(again.joint.tagKey).toBe("tige-2");
  });

  it("keeps the tag key when the joint is renamed", () => {
    const renamed = updateJointInDocument(withFirstRod, "tige", rod("body-1", "rod-1", "Rod"));
    expect(renamed.joint.tagKey).toBe("tige");
  });

  it("refuses a new child in an assembly where the tag key is taken", () => {
    const both = addJointToDocument(withFirstRod, rod("body-2", "rod-2")).document;
    // "tige-2" keeps its tag key "tige", already used in the assembly of body-1.
    expect(() => updateJointInDocument(both, "tige-2", rod("rod-2", "body-1"))).toThrow(
      'Tag key "tige" of joint "tige-2" is already used in the assembly of body "body-1".',
    );
  });
});
