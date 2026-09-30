import { describe, expect, it } from "vitest";
import { wrapInt32 } from "./evaluation-common.ts";
import { evaluateSensor } from "./evaluators.ts";
import { SENSOR_LABELS } from "./labels.ts";
import {
  SENSOR_PARAMETERS,
  SENSOR_TAGS,
  type SensorFields,
  SensorFieldsSchema,
} from "./schemas.ts";

// Sensor types (ADR 0023): registries consistent with their schemas, and
// their evaluations.

const TYPES = SensorFieldsSchema.options.map((option) => option.shape.type.value);
// The member pattern of the protocol's tag names (tag.ts).
const MEMBER = /^[a-z][a-z_]{0,31}$/;

describe("sensor type registries", () => {
  it.each(TYPES)("%s declares fields its schema has, feedback tags and every label", (type) => {
    const option = SensorFieldsSchema.options.find((item) => item.shape.type.value === type);
    const fields = Object.keys(option?.shape ?? {});
    for (const parameter of SENSOR_PARAMETERS[type]) {
      expect(fields).toContain(parameter.field);
    }
    for (const tag of SENSOR_TAGS[type]) {
      expect([tag.member, tag.direction]).toEqual([expect.stringMatching(MEMBER), "feedback"]);
    }
    for (const labels of Object.values(SENSOR_LABELS[type])) {
      for (const parameter of SENSOR_PARAMETERS[type]) {
        expect(labels.parameters[parameter.field]).toBeTruthy();
      }
      for (const tag of SENSOR_TAGS[type]) {
        expect(labels.tags[tag.member]).toBeTruthy();
      }
    }
  });
});

describe("position switch", () => {
  const extended: SensorFields = {
    type: "position_switch",
    range: [0.098, 0.1],
    normallyClosed: false,
  };

  it("is on within its range, bounds included, and off outside", () => {
    const state = (position: number) => evaluateSensor({ fields: extended, position }).state;
    expect([state(0.05), state(0.098), state(0.099), state(0.1), state(0.1001)]).toEqual([
      0, 1, 1, 1, 0,
    ]);
  });

  it("reads the other way when normally closed", () => {
    const closed = { ...extended, normallyClosed: true };
    expect(evaluateSensor({ fields: closed, position: 0.1 }).state).toBe(0);
    expect(evaluateSensor({ fields: closed, position: 0 }).state).toBe(1);
  });

  it("refuses reversed or infinite bounds, and accepts a single position", () => {
    const accepts = (range: unknown) =>
      SensorFieldsSchema.safeParse({ ...extended, range }).success;
    expect([
      accepts([0.1, 0]),
      accepts([0, Number.POSITIVE_INFINITY]),
      accepts([0.1, 0.1]),
    ]).toEqual([false, false, true]);
  });
});

describe("encoder", () => {
  const encoder = { type: "encoder", pulsesPerUnit: 1000 } as const;

  it("counts pulses from the reference position, to the nearest pulse, in both directions", () => {
    expect(evaluateSensor({ fields: encoder, position: 0.1234 }).count).toBe(123);
    expect(evaluateSensor({ fields: encoder, position: -0.0126 }).count).toBe(-13);
  });

  it("rounds a position halfway between two pulses up, on both sides", () => {
    expect(evaluateSensor({ fields: encoder, position: 0.0125 }).count).toBe(13);
    expect(evaluateSensor({ fields: encoder, position: -0.0125 }).count).toBe(-12);
  });

  it("wraps like a 32-bit signed PLC counter", () => {
    expect(wrapInt32(2 ** 31)).toBe(-(2 ** 31));
    expect(wrapInt32(-(2 ** 31) - 1)).toBe(2 ** 31 - 1);
    expect(wrapInt32(2 ** 32)).toBe(0);
    expect(Object.is(wrapInt32(-0), 0)).toBe(true);
    expect(wrapInt32(42)).toBe(42);
  });

  it("wraps the count of a joint far from its reference", () => {
    const fine = { type: "encoder", pulsesPerUnit: 1e9 } as const;
    expect(evaluateSensor({ fields: fine, position: 2.147483648 }).count).toBe(-(2 ** 31));
  });

  it("refuses a resolution that is zero, negative or infinite", () => {
    for (const pulsesPerUnit of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(SensorFieldsSchema.safeParse({ ...encoder, pulsesPerUnit }).success).toBe(false);
    }
  });
});
