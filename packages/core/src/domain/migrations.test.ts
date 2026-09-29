import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { migratePantinDocument } from "./migrations.ts";
import { parsePantinDocument } from "./pantin-document.ts";

const V1_DOCUMENT = {
  schema_version: 1,
  name: "Axis",
  bodies: [
    {
      id: "rail",
      name: "Rail",
      source: { fileName: "rail.stl", format: "stl", unit: "mm", upAxis: "z", nodes: [] },
      mesh: "meshes/rail.stl",
    },
  ],
};

describe("migratePantinDocument", () => {
  it("migrates version 1 to the current version by adding an empty joint list", () => {
    expect(PANTIN_SCHEMA_VERSION).toBe(2);
    expect(migratePantinDocument(V1_DOCUMENT, "axis/pantin.json")).toEqual({
      ...V1_DOCUMENT,
      schema_version: 2,
      joints: [],
    });
  });

  it("leaves a current document and non documents unchanged", () => {
    const current = { ...V1_DOCUMENT, schema_version: 2, joints: [] };
    expect(migratePantinDocument(current, "p")).toBe(current);
    expect(migratePantinDocument([1], "p")).toEqual([1]);
    expect(migratePantinDocument({ name: "x" }, "p")).toEqual({ name: "x" });
  });

  it("does not modify its input", () => {
    const input = structuredClone(V1_DOCUMENT);
    migratePantinDocument(input, "p");
    expect(input).toEqual(V1_DOCUMENT);
  });

  it("refuses a newer version with an actionable message", () => {
    expect(() =>
      migratePantinDocument({ ...V1_DOCUMENT, schema_version: 3 }, "axis/pantin.json"),
    ).toThrow(
      /axis\/pantin.json has schema_version 3, newer than this core supports \(2\)\. Update Pantin/,
    );
  });

  it("refuses a version no migration handles", () => {
    expect(() => migratePantinDocument({ ...V1_DOCUMENT, schema_version: 0 }, "p")).toThrow(
      /which no migration handles/,
    );
  });

  it("is applied when a pantin.json is parsed", () => {
    const document = parsePantinDocument(JSON.stringify(V1_DOCUMENT), "axis/pantin.json");
    expect(document).toMatchObject({ schema_version: 2, joints: [], bodies: [{ id: "rail" }] });
  });
});
