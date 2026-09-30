import { describe, expect, it } from "vitest";
import { type SensorFields, SensorFieldsSchema } from "./schemas.ts";
import { statesAlong } from "./test-support.ts";
import { switchZonesOf } from "./zones.ts";

// The realistic switches (ADR 0025): each turns on at its datasheet point and
// back off only past its hysteresis. Positions in metres, mm in the comments.

describe("mechanical limit switch", () => {
  // Pressed moving forwards at 98 mm, lets go at 97.5 mm, 2 mm of overtravel.
  const limit: SensorFields = {
    type: "limit_switch",
    operatingPosition: 0.098,
    actuation: "increasing",
    differentialTravel: 0.0005,
    overtravel: 0.002,
    normallyClosed: false,
  };

  it("changes over at its operating position and back past its differential travel", () => {
    expect(statesAlong(limit, [0.09, 0.0979, 0.098, 0.1, 0.0978, 0.0975, 0.0974])).toEqual([
      0, 0, 1, 1, 1, 1, 0,
    ]);
  });

  it("stays on pushed past its overtravel, which is only drawn", () => {
    expect(statesAlong(limit, [0.2])).toEqual([1]);
    expect(switchZonesOf(limit)?.shown).toEqual([0.098, 0.1]);
  });

  it("is pressed moving backwards the other way round", () => {
    const back: SensorFields = { ...limit, operatingPosition: 0.002, actuation: "decreasing" };
    expect(statesAlong(back, [0.01, 0.002, 0, 0.0024, 0.0026])).toEqual([0, 1, 1, 1, 0]);
    expect(switchZonesOf(back)?.shown).toEqual([0, 0.002]);
  });
});

describe("magnetic cylinder sensor", () => {
  // Centred at 50 mm, a 4 mm window, 1 mm of hysteresis.
  const reed: SensorFields = {
    type: "cylinder_switch",
    position: 0.05,
    windowWidth: 0.004,
    hysteresis: 0.001,
    normallyClosed: false,
  };

  it("turns on inside its window and off once it has left it by the hysteresis", () => {
    expect(statesAlong(reed, [0.047, 0.048, 0.0525, 0.0529, 0.0531, 0.0525])).toEqual([
      0, 1, 1, 1, 0, 0,
    ]);
  });
});

describe("inductive sensor", () => {
  // Face at 100 mm, Sn 4 mm, 10 % hysteresis, the target coming forwards.
  const inductive: SensorFields = {
    type: "inductive_switch",
    facePosition: 0.1,
    approach: "increasing",
    nominalDistance: 0.004,
    material: "steel",
    hysteresisPercent: 10,
    normallyClosed: false,
  };

  it("switches at Sn from the face on steel, and back at Sn plus the hysteresis", () => {
    // On at 96 mm, off beyond 95.6 mm.
    expect(statesAlong(inductive, [0.095, 0.0959, 0.096, 0.0957, 0.0955])).toEqual([0, 0, 1, 1, 0]);
  });

  it("detects aluminium closer to the face, by its correction factor", () => {
    const aluminium: SensorFields = { ...inductive, material: "aluminium" };
    // 0.35 × 4 mm = 1.4 mm: on from 98.6 mm.
    expect(statesAlong(aluminium, [0.098, 0.0987])).toEqual([0, 1]);
    const shown = switchZonesOf(aluminium)?.shown ?? [];
    expect(shown[0]).toBeCloseTo(0.0986, 12);
    expect(shown[1]).toBe(0.1);
  });
});

describe("realistic switches, the other way round", () => {
  it("keeps its hysteresis when normally closed: the output is inverted, not the zones", () => {
    const reed: SensorFields = {
      type: "cylinder_switch",
      position: 0.05,
      windowWidth: 0.004,
      hysteresis: 0.001,
      normallyClosed: true,
    };
    expect(statesAlong(reed, [0.047, 0.05, 0.0529, 0.0531])).toEqual([1, 0, 0, 1]);
  });

  it("detects a target coming backwards onto an inductive face", () => {
    const inductive: SensorFields = {
      type: "inductive_switch",
      facePosition: 0,
      approach: "decreasing",
      nominalDistance: 0.004,
      material: "steel",
      hysteresisPercent: 10,
      normallyClosed: false,
    };
    // On at 4 mm, off beyond 4.4 mm.
    expect(statesAlong(inductive, [0.005, 0.004, 0.0043, 0.0045])).toEqual([0, 1, 1, 0]);
    expect(switchZonesOf(inductive)?.shown).toEqual([0, 0.004]);
  });
});

// Each case lacks only normallyClosed, added by the test.
const REFUSED: [string, object][] = [
  [
    "an overtravel of zero",
    {
      type: "limit_switch",
      operatingPosition: 0,
      actuation: "increasing",
      differentialTravel: 0,
      overtravel: 0,
    },
  ],
  [
    "a negative differential travel",
    {
      type: "limit_switch",
      operatingPosition: 0,
      actuation: "increasing",
      differentialTravel: -1,
      overtravel: 1,
    },
  ],
  ["a window of zero", { type: "cylinder_switch", position: 0, windowWidth: 0, hysteresis: 0 }],
  [
    "a nominal distance of zero",
    {
      type: "inductive_switch",
      facePosition: 0,
      approach: "increasing",
      nominalDistance: 0,
      material: "steel",
      hysteresisPercent: 10,
    },
  ],
  [
    "a hysteresis over 50 %",
    {
      type: "inductive_switch",
      facePosition: 0,
      approach: "increasing",
      nominalDistance: 1,
      material: "steel",
      hysteresisPercent: 60,
    },
  ],
  [
    "an unknown material",
    {
      type: "inductive_switch",
      facePosition: 0,
      approach: "increasing",
      nominalDistance: 1,
      material: "gold",
      hysteresisPercent: 10,
    },
  ],
];

describe("realistic switch schemas", () => {
  it.each(REFUSED)("refuses %s", (_case, fields) => {
    expect(SensorFieldsSchema.safeParse({ ...fields, normallyClosed: false }).success).toBe(false);
  });
});
