import { describe, expect, it } from "vitest";
import { createPantinDocument } from "../domain/pantin-document.ts";
import { body } from "../test-support/placed-fixtures.ts";
import { meshPathsToKeep } from "./mesh-lifecycle.ts";
import { newOpenPantin } from "./open-pantins.ts";

// The keep rule of the orphan cleanup (ADR 0038 point 4): one set per source.

describe("meshPathsToKeep", () => {
  it("is empty for a Pantin that nothing uses", () => {
    expect(meshPathsToKeep(newOpenPantin(createPantinDocument("Axis"), "c"))).toEqual(new Set());
  });

  it.each([["savedMeshPaths"], ["writingMeshPaths"], ["pendingMeshDeletions"]] as const)(
    "keeps a path that only %s holds",
    (field) => {
      const openPantin = newOpenPantin(createPantinDocument("Axis"), "c");
      openPantin[field] = new Set(["meshes/a.stl"]);
      expect(meshPathsToKeep(openPantin)).toEqual(new Set(["meshes/a.stl"]));
    },
  );

  it("keeps a path that only the in-memory document uses", () => {
    const openPantin = newOpenPantin(createPantinDocument("Axis"), "c");
    openPantin.document = { ...openPantin.document, bodies: [body("a", "main")] };
    expect(meshPathsToKeep(openPantin)).toEqual(new Set(["meshes/a.stl"]));
  });
});
