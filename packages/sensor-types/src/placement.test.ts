import { describe, expect, it } from "vitest";
import { type SensorFields, sensorPlacementProblem } from "./schemas.ts";
import { statesAlong, TEST_STROKE } from "./test-support.ts";
import { switchDiagramOf } from "./zones.ts";

// The side of a switch deduced from its joint's stroke, the placements the
// document refuses, and the diagram of the sensor form (ADR 0026).

// The Pantin "test2": a 125 mm cylinder, an inductive sensor at its lower end.
const cylinder = [0, 0.125] as const;
const atRetracted: SensorFields = {
  type: "inductive_switch",
  facePosition: 0,
  nominalDistance: 0.005,
  material: "steel",
  hysteresisPercent: 1,
  normallyClosed: false,
};

describe("inductive sensor on the Pantin test2", () => {
  it("detects the rod near the face at the lower end, not over the whole stroke", () => {
    expect(statesAlong(atRetracted, [0.1, 0.05, 0.005, 0, 0.00505, 0.0051], cylinder)).toEqual([
      0, 0, 1, 1, 1, 0,
    ]);
  });

  it("refuses a face inside the stroke, where the target would hit it", () => {
    const inside: SensorFields = { ...atRetracted, facePosition: 0.002 };
    expect(sensorPlacementProblem(inside, cylinder)).toMatch(/inside the stroke/);
    expect(sensorPlacementProblem(atRetracted, cylinder)).toBeNull();
    expect(sensorPlacementProblem({ ...atRetracted, facePosition: -0.001 }, cylinder)).toBeNull();
  });
});

describe("placement against the stroke", () => {
  it("refuses a limit switch outside the stroke, at mid-stroke or crushed past its overtravel", () => {
    const limit: SensorFields = {
      type: "limit_switch",
      operatingPosition: 0.098,
      differentialTravel: 0.0005,
      overtravel: 0.002,
      normallyClosed: false,
    };
    const problemAt = (operatingPosition: number) =>
      sensorPlacementProblem({ ...limit, operatingPosition }, TEST_STROKE);
    expect(problemAt(0.098)).toBeNull();
    expect(problemAt(0.11)).toMatch(/outside the stroke/);
    expect(problemAt(0.05)).toMatch(/mid-stroke/);
    expect(problemAt(0.09)).toMatch(/overtravel/);
  });

  it("refuses the one-sided switches on a joint without end stops", () => {
    expect(sensorPlacementProblem(atRetracted, null)).toMatch(/end stops/);
    const limit: SensorFields = {
      type: "limit_switch",
      operatingPosition: 0,
      differentialTravel: 0,
      overtravel: 1,
      normallyClosed: false,
    };
    expect(sensorPlacementProblem(limit, null)).toMatch(/end stops/);
  });

  it("reads a window within one turn on a joint without end stops", () => {
    const degree = Math.PI / 180;
    const cam: SensorFields = {
      type: "position_switch",
      range: [-10 * degree, 10 * degree],
      normallyClosed: false,
    };
    const angles = [5, 355, 365, 725, 180, -350, 20].map((angle) => angle * degree);
    expect(statesAlong(cam, angles, null)).toEqual([1, 1, 1, 1, 0, 1, 0]);
    const turnsAway: SensorFields = { ...cam, range: [-400 * degree, -380 * degree] };
    expect(statesAlong(turnsAway, [330 * degree, 350 * degree], null)).toEqual([1, 0]);
    expect(sensorPlacementProblem(cam, null)).toBeNull();
  });
});

describe("switch diagram", () => {
  it("draws the face looking into the stroke, then the effective distance and the hysteresis", () => {
    const diagram = switchDiagramOf({ ...atRetracted, hysteresisPercent: 10 }, cylinder);
    expect(diagram?.symbol).toEqual({ kind: "face", at: 0, facing: "increasing" });
    const [face, reach, hysteresis] = diagram?.dimensions ?? [];
    expect(face).toEqual({ kind: "position", at: 0, label: "facePosition" });
    expect(reach).toEqual({ kind: "length", from: 0, to: 0.005, label: "reach" });
    expect(hysteresis).toMatchObject({ kind: "length", from: 0.005, label: "hysteresisPercent" });
    expect(hysteresis?.kind === "length" && hysteresis.to).toBeCloseTo(0.0055, 12);
  });
});
