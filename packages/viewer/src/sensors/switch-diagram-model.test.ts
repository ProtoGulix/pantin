import type { JointCoordinateUnit } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import type { SensorFields } from "@pantin/sensor-types/schemas";
import { describe, expect, it } from "vitest";
import {
  buildSwitchDiagramModel,
  DIAGRAM_WIDTH,
  drawnSpan,
  type SwitchDiagramInput,
  stackRows,
} from "./switch-diagram-model.ts";

// The dimensioned diagram of a switch (ADR 0026 point 4), as numbers.

const inductive = (facePosition: number): SensorFields => ({
  type: "inductive_switch",
  facePosition,
  nominalDistance: 0.005,
  material: "steel",
  hysteresisPercent: 10,
  normallyClosed: false,
});

const limit = (operatingPosition: number): SensorFields => ({
  type: "limit_switch",
  operatingPosition,
  differentialTravel: 0.0005,
  overtravel: 0.002,
  normallyClosed: false,
});

function model(
  fields: SensorFields,
  stroke: SwitchDiagramInput["stroke"],
  unit: JointCoordinateUnit = "metre",
) {
  const built = buildSwitchDiagramModel({
    fields,
    stroke,
    unit,
    unitSymbol: unit === "metre" ? "mm" : "°",
    labels: SENSOR_LABELS[fields.type].en,
  });
  if (built === null) {
    throw new Error("No diagram.");
  }
  return built;
}

describe("switch diagram model, on a stroke", () => {
  it("puts the on zone of a face at the low end on the + side of the face", () => {
    const { on, symbol, problem, bar, dimensions } = model(inductive(0), [0, 0.125]);
    expect(problem).toBeNull();
    expect(symbol).toMatchObject({ kind: "face", refused: false, facing: "increasing" });
    // On below the reach (5 mm), cut at the left of the span.
    expect(on.openLow).toBe(true);
    expect(on.x2).toBeGreaterThan(bar.x1);
    expect(on.x2).toBeLessThan(bar.x2);
    const reach = dimensions.find(({ text }) => text.endsWith(": 5 mm"));
    expect(reach?.x1).toBeCloseTo(symbol.x, 6);
    expect(reach?.x2).toBeCloseTo(on.x2, 6);
  });

  it("labels dimensions with their value in display units, on separate rows", () => {
    const { dimensions } = model(inductive(0), [0, 0.125]);
    expect(dimensions.map(({ text }) => text)).toContain("Face position: 0 mm");
    const rows = dimensions.map(({ y }) => y);
    expect(new Set(rows).size).toBeGreaterThan(1);
  });

  it("reports a face inside the stroke, drawn as refused", () => {
    const { problem, symbol } = model(inductive(0.05), [0, 0.125]);
    expect(problem).toEqual(expect.any(String));
    expect(symbol.refused).toBe(true);
  });

  it("draws a face beyond the stroke by widening the span", () => {
    const { symbol, bar } = model(inductive(0.2), [0, 0.125]);
    expect(symbol.x).toBeGreaterThan(bar.x2);
    expect(symbol.x).toBeLessThanOrEqual(DIAGRAM_WIDTH);
  });

  it("shows a limit switch at the max end and cuts its unbounded on zone with an arrow", () => {
    const { on, problem, symbol, bar } = model(limit(0.123), [0, 0.125]);
    expect(problem).toBeNull();
    expect(symbol.facing).toBe("decreasing");
    expect(on.openHigh).toBe(true);
    expect(on.openLow).toBe(false);
    expect(on.x2).toBeGreaterThan(bar.x2);
  });
});

describe("switch diagram model, on a continuous joint", () => {
  it("draws a continuous joint as one unrolled turn", () => {
    const span = drawnSpan(null, Math.PI, []);
    expect(span.lower).toBeLessThan(0);
    expect(span.upper).toBeGreaterThan(2 * Math.PI);
    const { bar, problem } = model(
      { type: "position_switch", range: [0.5, 1], normallyClosed: false },
      null,
      "radian",
    );
    expect(problem).toBeNull();
    expect(bar.x1).toBeGreaterThan(0);
    expect(bar.x2).toBeLessThan(DIAGRAM_WIDTH);
  });

  it("refuses a limit switch on a continuous joint", () => {
    expect(model(limit(1), null, "radian").problem).toEqual(expect.any(String));
  });
});

describe("stackRows", () => {
  it("keeps disjoint boxes on one row and moves an overlapping one down", () => {
    expect(
      stackRows([
        [0, 50],
        [100, 150],
        [40, 120],
      ]),
    ).toEqual([0, 0, 1]);
  });
});
