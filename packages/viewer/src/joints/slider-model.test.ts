import { describe, expect, it } from "vitest";
import { hingeJoint, slideJoint, spinJoint, weldJoint } from "../test-fixtures.ts";
import { buildJointSlider, positionFromSlider, sliderValue } from "./slider-model.ts";

function specOf(joint: Parameters<typeof buildJointSlider>[1]) {
  const spec = buildJointSlider("press", joint);
  if (spec === null) {
    throw new Error("Expected a slider.");
  }
  return spec;
}

describe("buildJointSlider", () => {
  it("spans the limits of a translation in millimetres", () => {
    expect(specOf(slideJoint)).toMatchObject({ displayUnit: "mm", min: 0, max: 100 });
  });

  it("spans the limits of a rotation in degrees", () => {
    const spec = specOf(hingeJoint);
    expect(spec.displayUnit).toBe("degree");
    expect(spec.min).toBeCloseTo(-90);
    expect(spec.max).toBeCloseTo(90);
  });

  it("gives a joint without limits a turn either way", () => {
    expect(specOf(spinJoint)).toMatchObject({ displayUnit: "degree", min: -360, max: 360 });
  });

  it("remembers the Pantin it moves", () => {
    expect(specOf(slideJoint).pantinId).toBe("press");
  });

  it("gives no slider to a joint that cannot move", () => {
    expect(buildJointSlider("press", weldJoint)).toBeNull();
  });
});

describe("slider values", () => {
  it("shows the core's position in display units", () => {
    expect(sliderValue(specOf(slideJoint), 0.025)).toBeCloseTo(25);
    expect(sliderValue(specOf(hingeJoint), Math.PI / 4)).toBeCloseTo(45);
  });

  it("shows zero before the stream has reported, and stays inside the range", () => {
    expect(sliderValue(specOf(slideJoint), undefined)).toBe(0);
    expect(sliderValue(specOf(slideJoint), 5)).toBe(100);
    expect(sliderValue(specOf(slideJoint), -5)).toBe(0);
  });

  it("sends SI to the core", () => {
    expect(positionFromSlider(specOf(slideJoint), 25)).toBeCloseTo(0.025);
    expect(positionFromSlider(specOf(hingeJoint), 90)).toBeCloseTo(Math.PI / 2);
  });
});
