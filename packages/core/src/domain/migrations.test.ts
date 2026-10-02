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

const CURRENT_OF_V1 = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Axis",
  assemblies: [
    { key: "main", name: "main", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  ],
  bodies: V1_DOCUMENT.bodies.map((body) => ({ ...body, assembly: "main" })),
  joints: [],
  drives: [],
  actuators: [],
  sensors: [],
};

describe("migratePantinDocument", () => {
  it("migrates version 1 to the current version, with an empty joint list", () => {
    expect(migratePantinDocument(V1_DOCUMENT, "axis/pantin.json")).toEqual(CURRENT_OF_V1);
  });

  it("migrates version 2 to the current version, adding only what later versions need", () => {
    const v2 = { ...V1_DOCUMENT, schema_version: 2, joints: [] };
    expect(migratePantinDocument(v2, "p")).toEqual(CURRENT_OF_V1);
  });

  it("puts every body in one assembly main, each joint keeping its id as tag key (ADR 0019)", () => {
    const joint = { id: "stroke", name: "Stroke", type: "fixed", parent: "rail", child: "tool" };
    const v3 = { ...V1_DOCUMENT, schema_version: 3, joints: [joint] };
    expect(migratePantinDocument(v3, "p")).toEqual({
      ...CURRENT_OF_V1,
      joints: [{ ...joint, tagKey: "stroke" }],
      drives: [],
      actuators: [],
      sensors: [],
    });
  });
});

describe("migratePantinDocument to version 5 (ADR 0022)", () => {
  it("adds an empty drive list", () => {
    const {
      drives: _drives,
      actuators: _actuators,
      sensors: _sensors,
      ...v4
    } = { ...CURRENT_OF_V1, schema_version: 4 };
    expect(migratePantinDocument(v4, "p")).toEqual(CURRENT_OF_V1);
  });
});

describe("migratePantinDocument to version 6 (ADR 0023)", () => {
  it("adds an empty sensor list", () => {
    const {
      sensors: _sensors,
      actuators: _actuators,
      ...v5
    } = { ...CURRENT_OF_V1, schema_version: 5 };
    expect(migratePantinDocument(v5, "p")).toEqual(CURRENT_OF_V1);
  });
});

describe("migratePantinDocument to version 7 (ADR 0025)", () => {
  it("keeps a version 6 document as it is, but for its version", () => {
    expect(migratePantinDocument({ ...CURRENT_OF_V1, schema_version: 6 }, "p")).toEqual(
      CURRENT_OF_V1,
    );
  });
});

describe("migratePantinDocument on unusual input", () => {
  it("leaves malformed bodies and joints to the schema, which reports them", () => {
    const malformed = {
      ...V1_DOCUMENT,
      schema_version: 3,
      bodies: "x",
      joints: [7, { name: "j" }],
      drives: [],
      sensors: [],
    };
    const migrated = migratePantinDocument(malformed, "p");
    expect(migrated).toMatchObject({ bodies: "x", joints: [7, { name: "j", tagKey: undefined }] });
    expect(() => parsePantinDocument(JSON.stringify(malformed), "axis/pantin.json")).toThrow(
      /axis\/pantin\.json/,
    );
  });

  it("leaves a current document and non documents unchanged", () => {
    const current = { ...V1_DOCUMENT, schema_version: PANTIN_SCHEMA_VERSION, joints: [] };
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
    const newer = PANTIN_SCHEMA_VERSION + 1;
    expect(() =>
      migratePantinDocument({ ...V1_DOCUMENT, schema_version: newer }, "axis/pantin.json"),
    ).toThrow(
      `axis/pantin.json has schema_version ${newer}, newer than this core supports (${PANTIN_SCHEMA_VERSION}). Update Pantin.`,
    );
  });

  it("refuses a version no migration handles", () => {
    expect(() => migratePantinDocument({ ...V1_DOCUMENT, schema_version: 0 }, "p")).toThrow(
      /which no migration handles/,
    );
  });

  it("is applied when a pantin.json is parsed", () => {
    const document = parsePantinDocument(JSON.stringify(V1_DOCUMENT), "axis/pantin.json");
    expect(document).toMatchObject({
      schema_version: PANTIN_SCHEMA_VERSION,
      joints: [],
      bodies: [{ id: "rail" }],
    });
  });
});
