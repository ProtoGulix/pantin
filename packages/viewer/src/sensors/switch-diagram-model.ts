import type { JointCoordinateUnit } from "@pantin/protocol";
import type { SensorLabels } from "@pantin/sensor-types/labels";
import { type SensorFields, sensorPlacementProblem } from "@pantin/sensor-types/schemas";
import {
  type DiagramDimension,
  type Direction,
  type Stroke,
  switchDiagramOf,
  switchZonesOf,
} from "@pantin/sensor-types/zones";
import { coordinateToDisplay, formatDisplayNumber } from "../units.ts";

// The dimensioned diagram of a switch (ADR 0026 point 4) as plain numbers in
// a viewBox: the UI only draws it. The type's diagram and zones are data from
// @pantin/sensor-types; here they are mapped onto a horizontal axis, clipped,
// and their dimension lines stacked so that labels do not overlap.

export const DIAGRAM_WIDTH = 300;
const MARGIN_SHARE = 0.06;
const TURN = 2 * Math.PI;
// Horizontal room of one character of a label, and the gap kept between two.
const CHAR_WIDTH = 5.4;
const LABEL_GAP = 6;
// Vertical layout: symbol, then the stroke bar, then the dimension rows.
const BAR_Y = 34;
const FIRST_ROW_Y = 66;
const ROW_PITCH = 20;
const BOTTOM_PAD = 6;

// A zone clipped to the drawn span; `open` ends are cut, so an arrow shows there.
interface DiagramBand {
  x1: number;
  x2: number;
  openLow: boolean;
  openHigh: boolean;
}

interface DimensionLine {
  x1: number;
  x2: number;
  y: number;
  text: string;
  // Where the text is centred.
  textX: number;
}

export interface SwitchDiagramModel {
  width: number;
  height: number;
  bar: { x1: number; x2: number; y: number };
  on: DiagramBand;
  hold: DiagramBand;
  symbol: {
    kind: "plunger" | "face" | "slot" | "range";
    x: number;
    facing: Direction | null;
    // Drawn in the error colour.
    refused: boolean;
  };
  dimensions: DimensionLine[];
  // Why the placement is refused, or null.
  problem: string | null;
}

export interface SwitchDiagramInput {
  fields: SensorFields;
  stroke: Stroke;
  labels: SensorLabels;
  unit: JointCoordinateUnit;
  // "mm" or "°".
  unitSymbol: string;
}

interface Span {
  lower: number;
  upper: number;
}

function dimensionCoordinates(dimension: DiagramDimension): number[] {
  return dimension.kind === "position" ? [0, dimension.at] : [dimension.from, dimension.to];
}

/** The stroke (a turn, unrolled, without one), widened to hold the symbol and every finite dimension. */
export function drawnSpan(
  stroke: Stroke,
  symbolAt: number,
  dimensions: readonly DiagramDimension[],
): Span {
  const [lower, upper] = stroke ?? [0, TURN];
  const coordinates = [lower, upper, symbolAt, ...dimensions.flatMap(dimensionCoordinates)].filter(
    Number.isFinite,
  );
  const low = Math.min(...coordinates);
  const high = Math.max(...coordinates);
  const margin = (high - low || 1) * MARGIN_SHARE;
  return { lower: low - margin, upper: high + margin };
}

function band(interval: readonly [number, number], span: Span, toX: (value: number) => number) {
  const [from, to] = interval;
  const clamp = (value: number) => Math.min(Math.max(value, span.lower), span.upper);
  const result: DiagramBand = {
    x1: toX(clamp(from)),
    x2: toX(clamp(to)),
    openLow: !(from >= span.lower),
    openHigh: !(to <= span.upper),
  };
  return result;
}

/** The first row where a box does not meet one already there; rows grow downwards. */
export function stackRows(boxes: readonly (readonly [number, number])[]): number[] {
  const rows: (readonly [number, number])[][] = [];
  return boxes.map(([from, to]) => {
    const free = (row: readonly (readonly [number, number])[]) =>
      row.every(
        ([otherFrom, otherTo]) => to + LABEL_GAP <= otherFrom || otherTo + LABEL_GAP <= from,
      );
    let index = rows.findIndex(free);
    if (index < 0) {
      index = rows.length;
      rows.push([]);
    }
    rows[index]?.push([from, to]);
    return index;
  });
}

function dimensionText(
  dimension: DiagramDimension,
  { labels, unit, unitSymbol }: SwitchDiagramInput,
): string {
  const label = labels.parameters[dimension.label] ?? labels.dimensions?.[dimension.label];
  const value = dimension.kind === "position" ? dimension.at : dimension.to - dimension.from;
  const shown = formatDisplayNumber(coordinateToDisplay(unit, value));
  return `${label ?? dimension.label}: ${shown} ${unitSymbol}`;
}

function dimensionLines(
  dimensions: readonly DiagramDimension[],
  input: SwitchDiagramInput,
  toX: (value: number) => number,
): DimensionLine[] {
  const drafts = dimensions.map((dimension) => {
    const [a = 0, b = 0] = dimensionCoordinates(dimension).map(toX);
    const text = dimensionText(dimension, input);
    const half = (text.length * CHAR_WIDTH) / 2;
    const textX = Math.min(Math.max((a + b) / 2, half), DIAGRAM_WIDTH - half);
    return { x1: Math.min(a, b), x2: Math.max(a, b), text, textX, half };
  });
  const rows = stackRows(
    drafts.map(({ x1, x2, textX, half }) => [
      Math.min(x1, textX - half),
      Math.max(x2, textX + half),
    ]),
  );
  return drafts.map(({ half: _half, ...draft }, index) => ({
    ...draft,
    y: FIRST_ROW_Y + (rows[index] ?? 0) * ROW_PITCH,
  }));
}

/** The diagram of a switch on its joint; null for a sensor that is not a switch. */
export function buildSwitchDiagramModel(input: SwitchDiagramInput): SwitchDiagramModel | null {
  const { fields, stroke } = input;
  const diagram = switchDiagramOf(fields, stroke);
  const zones = switchZonesOf(fields, stroke);
  if (diagram === null || zones === null) {
    return null;
  }
  const span = drawnSpan(stroke, diagram.symbol.at, diagram.dimensions);
  const toX = (value: number) => ((value - span.lower) / (span.upper - span.lower)) * DIAGRAM_WIDTH;
  const [lower, upper] = stroke ?? [0, TURN];
  const dimensions = dimensionLines(diagram.dimensions, input, toX);
  const problem = sensorPlacementProblem(fields, stroke);
  const lowest = Math.max(FIRST_ROW_Y - ROW_PITCH, ...dimensions.map(({ y }) => y));
  return {
    width: DIAGRAM_WIDTH,
    height: lowest + ROW_PITCH / 2 + BOTTOM_PAD,
    bar: { x1: toX(lower), x2: toX(upper), y: BAR_Y },
    on: band(zones.on, span, toX),
    hold: band(zones.hold, span, toX),
    symbol: {
      kind: diagram.symbol.kind,
      x: toX(diagram.symbol.at),
      facing: diagram.symbol.facing,
      refused: problem !== null,
    },
    dimensions,
    problem,
  };
}
