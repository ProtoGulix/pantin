import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Document rules of assemblies (ADR 0019).

function body(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "cylinder.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function rod(id: string, parent: string, child: string, tagKey = "tige") {
  return {
    id,
    tagKey,
    name: "Tige",
    type: "prismatic",
    parent,
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  };
}

// Two cylinders, each a body and its rod, in two assemblies.
const twoCylinders = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [
    { key: "verin_pince", name: "Vérin pince" },
    { key: "verin_levage", name: "Vérin levage" },
  ],
  bodies: [
    body("body-1", "verin_pince"),
    body("rod-1", "verin_pince"),
    body("body-2", "verin_levage"),
    body("rod-2", "verin_levage"),
  ],
  joints: [rod("tige", "body-1", "rod-1"), rod("tige-2", "body-2", "rod-2")],
};

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema assemblies", () => {
  it("accepts the same tag key in two assemblies", () => {
    expect(issuesOf(twoCylinders)).toEqual([]);
  });

  it("accepts an empty assembly", () => {
    const withEmpty = {
      ...twoCylinders,
      assemblies: [...twoCylinders.assemblies, { key: "spare", name: "Spare" }],
    };
    expect(issuesOf(withEmpty)).toEqual([]);
  });

  it("rejects a body in an unknown assembly", () => {
    const [first, ...others] = twoCylinders.bodies;
    const lost = { ...twoCylinders, bodies: [{ ...first, assembly: "ghost" }, ...others] };
    expect(issuesOf(lost)).toContain('Body "body-1" is in assembly "ghost", which does not exist.');
  });

  it("rejects two assemblies with the same key", () => {
    const twice = {
      ...twoCylinders,
      assemblies: [...twoCylinders.assemblies, { key: "verin_pince", name: "Copy" }],
    };
    expect(issuesOf(twice)).toContain(
      'Assembly key "verin_pince" is used twice; assembly keys must be unique.',
    );
  });

  it("rejects the same tag key twice in one assembly", () => {
    const clash = {
      ...twoCylinders,
      bodies: twoCylinders.bodies.map((item) => ({ ...item, assembly: "verin_pince" })),
    };
    expect(issuesOf(clash)).toContain(
      'Tag key "tige" of joint "tige-2" is already used in assembly "verin_pince".',
    );
  });
});
