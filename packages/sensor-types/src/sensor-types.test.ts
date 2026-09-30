import { describe, expect, it } from "vitest";
import { wrapInt32 } from "./evaluation-common.ts";
import { evaluateSensor } from "./evaluators.ts";
import { SENSOR_LABELS } from "./labels.ts";
import {
  SENSOR_PARAMETERS,
  SENSOR_TAGS,
  type SensorFields,
  SensorFieldsSchema,
  type SensorType,
  sensorPlacementProblem,
} from "./schemas.ts";
import { statesAlong } from "./test-support.ts";
import { switchDiagramOf, switchZonesOf } from "./zones.ts";

// Sensor types: registries consistent with their schemas (ADR 0023), the
// encoder, and the ideal switch; the realistic switches are in
// switches.test.ts (ADR 0025).

const TYPES = SensorFieldsSchema.options.map((option) => option.shape.type.value);
// The member pattern of the protocol's tag names (tag.ts).
const MEMBER = /^[a-z][a-z_]{0,31}$/;

// One valid sensor per type on a stroke of 0 to 1, keyed by type: a new type
// does not compile until it has a sample here.
const SAMPLE_STROKE = [0, 1] as const;
const SAMPLES: { readonly [Type in SensorType]: Extract<SensorFields, { type: Type }> } = {
  position_switch: { type: "position_switch", range: [0, 1], normallyClosed: false },
  limit_switch: {
    type: "limit_switch",
    operatingPosition: 1,
    differentialTravel: 0,
    overtravel: 1,
    normallyClosed: false,
  },
  cylinder_switch: {
    type: "cylinder_switch",
    position: 0,
    windowWidth: 1,
    hysteresis: 0,
    normallyClosed: false,
  },
  inductive_switch: {
    type: "inductive_switch",
    facePosition: 1,
    nominalDistance: 1,
    material: "steel",
    hysteresisPercent: 10,
    normallyClosed: false,
  },
  encoder: { type: "encoder", pulsesPerUnit: 1 },
};

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
        for (const value of parameter.options ?? []) {
          expect(labels.options?.[value]).toBeTruthy();
        }
      }
      for (const tag of SENSOR_TAGS[type]) {
        expect(labels.tags[tag.member]).toBeTruthy();
      }
    }
  });

  it.each(TYPES)("%s is valid, and evaluates to every tag it declares", (type) => {
    const fields = SAMPLES[type];
    expect(SensorFieldsSchema.safeParse(fields).success).toBe(true);
    expect(sensorPlacementProblem(fields, SAMPLE_STROKE)).toBeNull();
    const { values } = evaluateSensor({
      fields,
      position: 0.5,
      stroke: SAMPLE_STROKE,
      state: null,
    });
    expect(Object.keys(values)).toEqual(SENSOR_TAGS[type].map((tag) => tag.member));
  });

  it("gives zones and a diagram to every switch, and none to the encoder", () => {
    const withoutZones = TYPES.filter(
      (type) => switchZonesOf(SAMPLES[type], SAMPLE_STROKE) === null,
    );
    const withoutDiagram = TYPES.filter(
      (type) => switchDiagramOf(SAMPLES[type], SAMPLE_STROKE) === null,
    );
    expect([withoutZones, withoutDiagram]).toEqual([["encoder"], ["encoder"]]);
  });

  it.each(TYPES)("%s labels every dimension of its diagram", (type) => {
    const dimensions = switchDiagramOf(SAMPLES[type], SAMPLE_STROKE)?.dimensions ?? [];
    for (const labels of Object.values(SENSOR_LABELS[type])) {
      for (const { label } of dimensions) {
        expect(labels.parameters[label] ?? labels.dimensions?.[label]).toBeTruthy();
      }
    }
  });
});

describe("ideal switch", () => {
  const extended: SensorFields = {
    type: "position_switch",
    range: [0.098, 0.1],
    normallyClosed: false,
  };

  it("is on within its range, bounds included, and off outside, without hysteresis", () => {
    expect(statesAlong(extended, [0.05, 0.098, 0.099, 0.1, 0.1001, 0.0979])).toEqual([
      0, 1, 1, 1, 0, 0,
    ]);
  });

  it("reads the other way when normally closed", () => {
    expect(statesAlong({ ...extended, normallyClosed: true }, [0.1, 0])).toEqual([0, 1]);
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
  const count = (fields: SensorFields, position: number) =>
    evaluateSensor({ fields, position, stroke: null, state: null }).values.count;

  it("counts pulses from the reference position, to the nearest pulse, in both directions", () => {
    expect([count(encoder, 0.1234), count(encoder, -0.0126)]).toEqual([123, -13]);
  });

  it("rounds a position halfway between two pulses up, on both sides", () => {
    expect([count(encoder, 0.0125), count(encoder, -0.0125)]).toEqual([13, -12]);
  });

  it("wraps like a 32-bit signed PLC counter", () => {
    expect(wrapInt32(2 ** 31)).toBe(-(2 ** 31));
    expect(wrapInt32(-(2 ** 31) - 1)).toBe(2 ** 31 - 1);
    expect(wrapInt32(2 ** 32)).toBe(0);
    expect(Object.is(wrapInt32(-0), 0)).toBe(true);
    expect(count({ type: "encoder", pulsesPerUnit: 1e9 }, 2.147483648)).toBe(-(2 ** 31));
  });

  it("refuses a resolution that is zero, negative or infinite", () => {
    for (const pulsesPerUnit of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(SensorFieldsSchema.safeParse({ ...encoder, pulsesPerUnit }).success).toBe(false);
    }
  });
});
