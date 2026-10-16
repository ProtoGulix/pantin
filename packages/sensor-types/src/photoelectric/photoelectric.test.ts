import { describe, expect, it } from "vitest";
import { PRESENCE_SENSOR_LABELS } from "../labels.ts";
import {
  PRESENCE_SENSOR_PARAMETERS,
  PRESENCE_SENSOR_TAGS,
  PresenceSensorFieldsSchema,
} from "../schemas.ts";

// The photoelectric cell's schema and the presence family's records (ADR 0043
// points 7 and 8). Its evaluation is a later slice.

const CELL = {
  type: "photoelectric",
  mode: "diffuse",
  range: 0.6,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0.05,
};

const TYPES = PresenceSensorFieldsSchema.options.map((option) => option.shape.type.value);

function messagesOf(fields: unknown): string {
  const parsed = PresenceSensorFieldsSchema.safeParse(fields);
  return parsed.success ? "" : parsed.error.issues.map((issue) => issue.message).join(" ");
}

describe("photoelectric fields", () => {
  it("accepts both modes", () => {
    expect(PresenceSensorFieldsSchema.safeParse(CELL).success).toBe(true);
    expect(PresenceSensorFieldsSchema.safeParse({ ...CELL, mode: "through_beam" }).success).toBe(
      true,
    );
  });

  it.each([
    ["a zero range", { range: 0 }, /range must be greater than zero/],
    ["an infinite range", { range: Number.POSITIVE_INFINITY }, /received Infinity/],
    ["a negative on delay", { onDelay: -0.001 }, /on delay must not be negative/],
    ["a negative off delay", { offDelay: -1 }, /off delay must not be negative/],
    ["another mode", { mode: "retro" }, /Invalid option/],
  ])("refuses %s", (_case, change, message) => {
    expect(messagesOf({ ...CELL, ...change })).toMatch(message);
  });
});

describe("presence family registries", () => {
  it("has one entry per type in each record", () => {
    expect(TYPES).toEqual(["photoelectric"]);
    for (const type of TYPES) {
      expect(PRESENCE_SENSOR_PARAMETERS[type].length).toBeGreaterThan(0);
      expect(PRESENCE_SENSOR_LABELS[type].en.name).not.toBe("");
      expect(PRESENCE_SENSOR_TAGS[type]).toEqual([
        { member: "state", type: "bit", direction: "feedback" },
      ]);
    }
  });

  it("declares a parameter and a label for every field of the cell, in both languages", () => {
    const fields = Object.keys(CELL).filter((field) => field !== "type");
    expect(PRESENCE_SENSOR_PARAMETERS.photoelectric.map(({ field }) => field)).toEqual(
      expect.arrayContaining(fields),
    );
    for (const language of ["en", "fr"] as const) {
      const labels = PRESENCE_SENSOR_LABELS.photoelectric[language];
      expect(Object.keys(labels.parameters).sort()).toEqual([...fields].sort());
      expect(Object.keys(labels.options ?? {}).sort()).toEqual(["diffuse", "through_beam"]);
      expect(Object.keys(labels.tags)).toEqual(["state"]);
    }
  });

  it("types range as a length and delays as durations", () => {
    const kinds = Object.fromEntries(
      PRESENCE_SENSOR_PARAMETERS.photoelectric.map(({ field, kind }) => [field, kind]),
    );
    expect(kinds).toMatchObject({ range: "length", onDelay: "duration", offDelay: "duration" });
  });
});
