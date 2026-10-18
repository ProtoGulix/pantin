import {
  type Body,
  bodyEndpoint,
  type CreateJointRequest,
  groupEndpoint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { addFixedJoints } from "./import-joints.ts";
import { addJointToDocument } from "./joint-rules.ts";

function body(id: string, name = id, assembly = "main"): Body {
  return {
    id,
    name,
    assembly,
    source: { fileName: "rail.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function documentWith(bodies: Body[]): PantinDocument {
  const keys = [...new Set(bodies.map(({ assembly }) => assembly))];
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: keys.map((key) => ({
      key,
      name: key,
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })),
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
  parent: bodyEndpoint(""),
  child: bodyEndpoint(""),
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

  it("adds no joint between bodies of one assembly: they follow it", () => {
    const bodies = [body("rail"), body("carriage"), body("stop")];
    const document = documentWith(bodies);
    expect(addFixedJoints(document, star(bodies))).toEqual({ document, joints: [] });
  });

  it("adds one fixed joint per child assembly, from group to group, named after the child body", () => {
    const bodies = [body("rail", "Rail"), body("carriage", "Carriage", "sub")];
    const { document, joints } = addFixedJoints(documentWith(bodies), star(bodies));
    expect(joints).toEqual([
      {
        id: "carriage",
        tagKey: "carriage",
        type: "fixed",
        name: "Carriage",
        parent: groupEndpoint("main"),
        child: groupEndpoint("sub"),
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
    ]);
    expect(document.joints).toEqual(joints);
  });

  it("keeps joint ids unique against the joints already in the document", () => {
    const earlier = [body("frame"), body("plate")];
    const imported = [body("rail"), body("plate-2", "plate", "sub")];
    const link = {
      ...FIXED_REQUEST,
      name: "plate",
      parent: bodyEndpoint("frame"),
      child: bodyEndpoint("plate"),
    };
    const withEarlierJoint = addJointToDocument(
      documentWith([...earlier, ...imported]),
      link,
      NO_POSITIONS,
    ).document;
    const { joints } = addFixedJoints(withEarlierJoint, star(imported));
    expect(joints.map((joint) => joint.id)).toEqual(["plate-2"]);
  });
});
