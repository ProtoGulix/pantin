import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { computePoses } from "./kinematics.ts";
import { parsePantinDocument } from "./pantin-document.ts";

// Version 9 to 10 (ADR 0033 point 10).

const SOURCE = { fileName: "a.stl", format: "stl", unit: "m", upAxis: "z", nodes: [] };

function body(id: string, assembly: string) {
  return { id, name: id, assembly, source: SOURCE, mesh: `meshes/${id}.stl` };
}

function joint(id: string, parent: string, child: string) {
  return {
    id,
    tagKey: id,
    name: id,
    type: "revolute",
    parent,
    child,
    origin: [0.5, 0.25, 0],
    axis: [0, 1, 1],
    limits: [-3, 3],
  };
}

function read(document: unknown) {
  return parsePantinDocument(JSON.stringify(document), "p");
}

function v9(joints: unknown[]) {
  return {
    schema_version: 9,
    name: "Machine",
    assemblies: [
      { key: "a", name: "A" },
      { key: "b", name: "B" },
      { key: "c", name: "C" },
    ],
    bodies: [body("a0", "a"), body("a1", "a"), body("b0", "b"), body("c0", "c")],
    joints,
    drives: [],
    actuators: [],
    sensors: [],
  };
}

describe("migration of assemblies to version 10", () => {
  const joints = [joint("j1", "a0", "a1"), joint("j2", "a1", "b0"), joint("j3", "b0", "c0")];

  it("gives every assembly the identity placement and keeps the joints as they are", () => {
    const document = read(v9(joints));
    expect(document.schema_version).toBe(PANTIN_SCHEMA_VERSION);
    expect(document.assemblies.map((assembly) => assembly.placement)).toEqual(
      Array(3).fill({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] }),
    );
    expect(document.joints).toEqual(joints);
  });

  it("gives the same poses as one assembly holding every body, bit for bit", () => {
    const document = read(v9(joints));
    const positions = new Map([
      ["j1", 0.4],
      ["j2", -1.1],
      ["j3", 2.2],
    ]);
    const poses = computePoses(document, positions);
    // Same joints in one assembly: the poses before the migration.
    const flat = read({
      ...v9(joints),
      bodies: v9(joints).bodies.map((item) => ({ ...item, assembly: "a" })),
    });
    expect(poses).toEqual(computePoses(flat, positions));
  });

  it("fails with the joints named when an assembly has two anchors", () => {
    const twice = [joint("j1", "a0", "b0"), joint("j2", "a1", "b0")];
    expect(() => read(v9(twice))).toThrow(
      /Assembly "b" is anchored twice: by joint "j1" and joint "j2"/,
    );
  });

  it("fails with the joints named when anchors form a loop", () => {
    const loop = [joint("j1", "a0", "b0"), joint("j2", "b0", "a1")];
    expect(() => read(v9(loop))).toThrow(/loop of anchors.*"j1"/);
  });
});
