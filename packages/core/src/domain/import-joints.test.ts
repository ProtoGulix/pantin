import {
  type Body,
  type CreateJointRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { addFixedJoints } from "./import-joints.ts";
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
    assemblies: [
      { key: "main", name: "main", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    ],
    bodies,
    joints: [],
    drives: [],
    actuators: [],
    sensors: [],
    belts: [],
    guides: [],
    emitters: [],
    absorbers: [],
    presenceSensors: [],
  };
}

const FIXED_REQUEST: CreateJointRequest = {
  type: "fixed",
  name: "joint",
  parent: "",
  child: "",
  origin: [0, 0, 0],
  axis: [0, 0, 1],
};

function star(bodies: Body[]): { parent: Body; child: Body }[] {
  const [root, ...children] = bodies;
  return root === undefined ? [] : children.map((child) => ({ parent: root, child }));
}

describe("addFixedJoints", () => {
  it("adds no joint without a link", () => {
    const document = documentWith([body("rail")]);
    expect(addFixedJoints(document, [])).toEqual({ document, joints: [] });
  });

  it("adds one fixed joint per link, here every other body a child of the first one, named after the child", () => {
    const bodies = [body("rail", "Rail"), body("carriage", "Carriage"), body("stop", "Stop")];
    const { document, joints } = addFixedJoints(documentWith(bodies), star(bodies));
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
    const link = { ...FIXED_REQUEST, name: "plate", parent: "frame", child: "plate" };
    const withEarlierJoint = addJointToDocument(
      documentWith([...earlier, ...imported]),
      link,
      NO_POSITIONS,
    ).document;
    const { joints } = addFixedJoints(withEarlierJoint, star(imported));
    expect(joints.map((joint) => joint.id)).toEqual(["plate-2"]);
  });
});
