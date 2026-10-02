import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";
import { PLACEMENT_QUATERNION_TOLERANCE } from "./placement.ts";

// Anchor rules of assemblies and the placement schema (ADR 0033).

const IDENTITY = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };

function assembly(
  key: string,
  placement: unknown = IDENTITY,
): { key: string; name: string; placement?: unknown } {
  return { key, name: key, placement };
}

function body(id: string, assemblyKey: string) {
  return {
    id,
    name: id,
    assembly: assemblyKey,
    source: { fileName: "a.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function fixedJoint(id: string, parent: string, child: string) {
  return {
    id,
    tagKey: id,
    name: id,
    type: "fixed",
    parent,
    child,
    origin: [0, 0, 0],
    axis: [0, 0, 1],
  };
}

function documentOf(joints: unknown[], assemblies = [assembly("a"), assembly("b"), assembly("c")]) {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies,
    bodies: [body("a0", "a"), body("a1", "a"), body("b0", "b"), body("b1", "b"), body("c0", "c")],
    joints,
    drives: [],
    actuators: [],
    sensors: [],
  };
}

// The document with `first` in place of assembly "a", the others unchanged.
// `first` is deliberately malformed, so it is cast past the fixture's type.
function withFirstAssembly(first: unknown) {
  return documentOf([], [first as ReturnType<typeof assembly>, assembly("b"), assembly("c")]);
}

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("anchors of assemblies", () => {
  it("accepts a chain of anchors and joints inside an assembly", () => {
    const joints = [
      fixedJoint("in-a", "a0", "a1"),
      fixedJoint("a-b", "a1", "b0"),
      fixedJoint("b-c", "b1", "c0"),
    ];
    expect(issuesOf(documentOf(joints))).toEqual([]);
  });

  it("refuses an assembly anchored twice, naming both joints", () => {
    const joints = [fixedJoint("first", "a0", "b0"), fixedJoint("second", "c0", "b1")];
    expect(issuesOf(documentOf(joints))).toEqual([
      'Assembly "b" is anchored twice: by joint "first" and joint "second".',
    ]);
  });

  it("refuses a loop of anchors, naming the joints of the loop", () => {
    const joints = [fixedJoint("a-b", "a0", "b0"), fixedJoint("b-a", "b1", "a1")];
    const issues = issuesOf(documentOf(joints));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"a-b"');
    expect(issues[0]).toContain('"b-a"');
  });
});

describe("placement", () => {
  it("is required on an assembly", () => {
    const { placement: _placement, ...bare } = assembly("a");
    expect(issuesOf(withFirstAssembly(bare))).not.toEqual([]);
  });

  it("refuses a quaternion that is not of unit length", () => {
    const tilted = assembly("a", { translation: [0, 0, 0], rotation: [0, 0, 0, 1.01] });
    expect(issuesOf(withFirstAssembly(tilted))).toEqual([
      expect.stringContaining("unit quaternion"),
    ]);
  });

  it("accepts a length within the tolerance and refuses one beyond it", () => {
    const near = (error: number) =>
      assembly("a", { translation: [0, 0, 0], rotation: [0, 0, 0, 1 + error] });
    expect(issuesOf(withFirstAssembly(near(PLACEMENT_QUATERNION_TOLERANCE / 2)))).toEqual([]);
    expect(issuesOf(withFirstAssembly(near(PLACEMENT_QUATERNION_TOLERANCE * 2)))).not.toEqual([]);
  });

  it("refuses a value that is not finite", () => {
    const infinite = assembly("a", {
      translation: [Number.POSITIVE_INFINITY, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    expect(issuesOf(withFirstAssembly(infinite))).not.toEqual([]);
  });
});
