import { describe, expect, it } from "vitest";
import { KeySchema, PantinIdSchema } from "./ids.ts";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

describe("PantinIdSchema", () => {
  it.each(["linear-axis", "a", "axis-800", "0"])("accepts %s", (id) => {
    expect(PantinIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    "..",
    "../../etc",
    "a/b",
    "/etc",
    "a\\b",
    ".hidden",
    "",
    "Upper",
    "-dash",
    "dash-",
    "x".repeat(65),
  ])("rejects %j", (id) => {
    expect(PantinIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("KeySchema (ADR 0019)", () => {
  it.each(["verin_pince", "tige", "axis-800", "0"])("accepts %s", (key) => {
    expect(KeySchema.safeParse(key).success).toBe(true);
  });

  it.each(["a.b", "_tige", "tige_", "Upper", "", "x".repeat(65)])("rejects %j", (key) => {
    expect(KeySchema.safeParse(key).success).toBe(false);
  });
});

describe("PantinDocumentSchema", () => {
  const validDocument = {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Linear axis",
    assemblies: [{ key: "axis", name: "Axis 800" }],
    bodies: [
      {
        id: "rail",
        name: "Rail",
        assembly: "axis",
        source: {
          fileName: "axis.glb",
          format: "glb",
          unit: "m",
          upAxis: "z",
          nodes: [{ name: "3630.00.0800N_0_1", path: [0, 0] }],
        },
        mesh: "meshes/rail.glb",
      },
    ],
    joints: [],
    drives: [],
    sensors: [],
  };

  it("accepts a complete document", () => {
    expect(PantinDocumentSchema.parse(validDocument)).toEqual(validDocument);
  });

  it("rejects an unknown schema version", () => {
    expect(PantinDocumentSchema.safeParse({ ...validDocument, schema_version: 1 }).success).toBe(
      false,
    );
  });

  it("rejects two bodies with the same id", () => {
    const [body] = validDocument.bodies;
    const duplicated = { ...validDocument, bodies: [body, { ...body, name: "Copy" }] };

    expect(PantinDocumentSchema.safeParse(duplicated).success).toBe(false);
  });

  it("rejects an empty display name", () => {
    expect(PantinDocumentSchema.safeParse({ ...validDocument, name: "  " }).success).toBe(false);
  });
});
