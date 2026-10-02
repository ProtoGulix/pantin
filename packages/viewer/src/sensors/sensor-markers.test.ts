import type { PantinDocument, Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { hingeJoint, pantinResponse, railBody, slideJoint, stepBody } from "../test-fixtures.ts";
import { sensorMarkersOf } from "./sensor-markers.ts";

// What the 3D view draws for each sensor (ADR 0024).

const base = { assembly: "main", normallyClosed: false, type: "position_switch" } as const;
const sensors: Sensor[] = [
  { ...base, id: "max", tagKey: "max", name: "Max", joint: "slide", range: [0.098, 0.1] },
  { ...base, id: "open", tagKey: "open", name: "Open", joint: "hinge", range: [1, 1.5] },
  {
    id: "count",
    tagKey: "count",
    name: "Count",
    assembly: "main",
    joint: "slide",
    type: "encoder",
    pulsesPerUnit: 1000,
  },
];
const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
  hingeJoint,
]);
const document: PantinDocument = { ...response.document, sensors };

describe("sensorMarkersOf", () => {
  it("draws a switch over its range: along the axis in metres, as an arc in radians", () => {
    const [max, open] = sensorMarkersOf(document);
    expect(max).toEqual({
      sensorId: "max",
      parentBodyId: slideJoint.parent,
      childBodyId: slideJoint.child,
      origin: slideJoint.origin,
      axis: slideJoint.axis,
      shape: { kind: "segment", from: 0.098, to: 0.1 },
      stateTag: "main.max.state",
    });
    expect(open?.shape).toEqual({ kind: "arc", from: 1, to: 1.5 });
  });

  it("draws a type without a range as a ring, and one without a bit in one colour", () => {
    expect(sensorMarkersOf(document)[2]).toMatchObject({ shape: { kind: "ring" }, stateTag: null });
  });

  it("draws no marker for a sensor on a fixed or a missing joint", () => {
    const weld = { ...slideJoint, id: "weld", tagKey: "weld", type: "fixed" as const };
    const orphan = (id: string, joint: string): Sensor => ({
      ...base,
      id,
      tagKey: id,
      name: id,
      joint,
      range: [0, 0.01],
    });
    const orphans = [orphan("a", "weld"), orphan("b", "ghost")];
    const withWeld = { ...document, joints: [...document.joints, weld], sensors: orphans };
    expect(sensorMarkersOf(withWeld)).toEqual([]);
  });

  it("draws nothing without a Pantin", () => {
    expect(sensorMarkersOf(undefined)).toEqual([]);
  });

  it("draws from the parent body's frame when that body is placed in its assembly", () => {
    const placedRail = {
      ...railBody,
      placement: {
        translation: [0.1, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
      },
    };
    const placedDocument: PantinDocument = {
      ...document,
      bodies: document.bodies.map((body) => (body.id === railBody.id ? placedRail : body)),
    };
    const [max] = sensorMarkersOf(placedDocument);
    expect(max?.origin[0]).toBeCloseTo(slideJoint.origin[0] - 0.1, 12);
    expect(max?.axis).toEqual(slideJoint.axis);
  });
});
