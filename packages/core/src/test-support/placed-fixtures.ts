import {
  type Assembly,
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { expect } from "vitest";
import { computePoses } from "../domain/kinematics.ts";
import { expectPoint } from "./expect-point.ts";

// Documents with rotated, translated placements, so that a wrong frame shows,
// and the check that two documents display the same poses.

const SINE = Math.SQRT1_2;
const HALF = 0.5;
export const ABOUT_X: Placement = { translation: [0.4, -0.2, 0.7], rotation: [SINE, 0, 0, SINE] };
export const ABOUT_Z: Placement = { translation: [-0.3, 0.5, 0.1], rotation: [0, 0, SINE, SINE] };
export const ABOUT_DIAGONAL: Placement = {
  translation: [0.9, 0.2, -0.4],
  rotation: [HALF, HALF, HALF, HALF],
};

export function assembly(key: string, placement: Placement): Assembly {
  return { key, name: key, placement };
}

export function body(id: string, assemblyKey: string, placement?: Placement): Body {
  const source: Body["source"] = {
    fileName: "a.stl",
    format: "stl",
    unit: "m",
    upAxis: "z",
    nodes: [],
  };
  const base = { id, name: id, assembly: assemblyKey, source, mesh: `meshes/${id}.stl` };
  return placement === undefined ? base : { ...base, placement };
}

export function joint(fields: Partial<Joint> & Pick<Joint, "id" | "parent" | "child">): Joint {
  return {
    tagKey: fields.id,
    name: fields.id,
    type: "revolute",
    origin: [0.1, 0.2, 0.3],
    axis: [0, 0, 1],
    limits: [-Math.PI, Math.PI],
    ...fields,
    // Joint is a union keyed by `type`; spreading partial fields over a
    // revolute default cannot be narrowed by the compiler.
  } as Joint;
}

export function documentOf(
  joints: Joint[],
  bodies?: Body[],
  assemblies?: Assembly[],
): PantinDocument {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: assemblies ?? [
      assembly("main", ABOUT_Z),
      assembly("chape", ABOUT_X),
      assembly("tail", ABOUT_DIAGONAL),
      assembly("other", ABOUT_DIAGONAL),
    ],
    bodies: bodies ?? [
      body("frame", "main"),
      body("carriage", "main", ABOUT_X),
      body("clevis", "chape", ABOUT_Z),
      body("rod", "chape", ABOUT_DIAGONAL),
      body("pin", "tail"),
    ],
    joints,
    drives: [],
    actuators: [],
    sensors: [],
  };
}

export function expectSamePoses(
  actual: PantinDocument,
  expected: PantinDocument,
  positions: ReadonlyMap<string, number>,
  bodyIds?: string[],
) {
  const wanted = computePoses(expected, positions);
  for (const pose of computePoses(actual, positions)) {
    const reference = wanted.find((candidate) => candidate.bodyId === pose.bodyId);
    if (reference === undefined || (bodyIds !== undefined && !bodyIds.includes(pose.bodyId))) {
      continue;
    }
    expectPoint(pose.translation, reference.translation);
    // q and -q are the same rotation: the unit quaternions agree when |q . r| = 1.
    const dot = pose.rotation.reduce(
      (sum, value, index) => sum + value * (reference.rotation[index] ?? 0),
      0,
    );
    expect(Math.abs(dot)).toBeCloseTo(1, 12);
  }
}
