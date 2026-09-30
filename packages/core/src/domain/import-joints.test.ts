import { type Body, PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { addStarJoints } from "./import-joints.ts";
import { addJointToDocument } from "./joint-rules.ts";

function body(id: string, name = id): Body {
  return {
    id,
    name,
    assembly: "main",
    source: { fileName: "rail.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function documentWith(bodies: Body[]): PantinDocument {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: [{ key: "main", name: "main" }],
    bodies,
    joints: [],
    drives: [],
  };
}

describe("addStarJoints", () => {
  it("adds no joint for a single body", () => {
    const rail = body("rail");
    const document = documentWith([rail]);
    expect(addStarJoints(document, [rail])).toEqual({ document, joints: [] });
  });

  it("makes every other body a fixed child of the first one, named after the child", () => {
    const bodies = [body("rail", "Rail"), body("carriage", "Carriage"), body("stop", "Stop")];
    const { document, joints } = addStarJoints(documentWith(bodies), bodies);
    expect(joints).toEqual([
      {
        id: "carriage",
        tagKey: "carriage",
        type: "fixed",
        name: "Carriage",
        parent: "rail",
        child: "carriage",
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
      {
        id: "stop",
        tagKey: "stop",
        type: "fixed",
        name: "Stop",
        parent: "rail",
        child: "stop",
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
    ]);
    expect(document.joints).toEqual(joints);
  });

  it("keeps joint ids unique against the joints already in the document", () => {
    const earlier = [body("frame"), body("plate")];
    const imported = [body("rail"), body("plate-2", "plate")];
    const withEarlierJoint = addJointToDocument(documentWith([...earlier, ...imported]), {
      type: "fixed",
      name: "plate",
      parent: "frame",
      child: "plate",
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    }).document;
    const { joints } = addStarJoints(withEarlierJoint, imported);
    expect(joints.map((joint) => joint.id)).toEqual(["plate-2"]);
  });
});
