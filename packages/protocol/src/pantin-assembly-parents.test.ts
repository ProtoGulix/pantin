import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Structure tree of assemblies (ADR 0040 point 1).

const PLACEMENT = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };

function assembly(key: string, parent?: string) {
  return { key, name: key, placement: PLACEMENT, ...(parent === undefined ? {} : { parent }) };
}

function documentOf(assemblies: unknown[]) {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Machine",
    assemblies,
    bodies: [],
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

function issuesOf(assemblies: unknown[]): string[] {
  const parsed = PantinDocumentSchema.safeParse(documentOf(assemblies));
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("assembly parents", () => {
  it("accepts a nested tree and top-level assemblies with no parent", () => {
    expect(
      issuesOf([assembly("a"), assembly("b", "a"), assembly("c", "b"), assembly("d")]),
    ).toEqual([]);
  });

  it("refuses an unknown parent, naming both assemblies", () => {
    expect(issuesOf([assembly("a", "ghost")])).toEqual([
      'Assembly "a" has parent "ghost", which does not exist. Create that assembly or remove the parent.',
    ]);
  });

  it("refuses an assembly that is its own parent", () => {
    expect(issuesOf([assembly("a", "a")])).toEqual([
      'Assembly "a" is its own parent; an assembly cannot contain itself.',
    ]);
  });

  it("refuses a loop of parents, naming the assemblies once", () => {
    const issues = issuesOf([
      assembly("root"),
      assembly("a", "c"),
      assembly("b", "a"),
      assembly("c", "b"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Assembly parents form a loop: "a" in "c" in "b" in "a"\./);
  });
});
