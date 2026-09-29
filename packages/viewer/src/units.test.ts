import { describe, expect, it } from "vitest";
import {
  coordinateFromDisplay,
  coordinateToDisplay,
  displayUnitOf,
  formatDisplayNumber,
  metresToMillimetres,
  millimetresToMetres,
} from "./units.ts";

describe("lengths", () => {
  it("converts metres and millimetres both ways", () => {
    expect(metresToMillimetres(0.025)).toBeCloseTo(25);
    expect(millimetresToMetres(25)).toBeCloseTo(0.025);
  });
});

describe("coordinates", () => {
  it("shows a translation in millimetres and a rotation in degrees", () => {
    expect(coordinateToDisplay("metre", 0.1)).toBeCloseTo(100);
    expect(coordinateToDisplay("radian", Math.PI)).toBeCloseTo(180);
    expect(displayUnitOf("metre")).toBe("mm");
    expect(displayUnitOf("radian")).toBe("degree");
  });

  it("sends SI to the core", () => {
    expect(coordinateFromDisplay("metre", 100)).toBeCloseTo(0.1);
    expect(coordinateFromDisplay("radian", 90)).toBeCloseTo(Math.PI / 2);
  });

  it("round-trips", () => {
    expect(coordinateFromDisplay("radian", coordinateToDisplay("radian", 1.234))).toBeCloseTo(
      1.234,
    );
  });

  it("leaves a joint without coordinate untouched", () => {
    expect(displayUnitOf(null)).toBeNull();
    expect(coordinateToDisplay(null, 3)).toBe(3);
    expect(coordinateFromDisplay(null, 3)).toBe(3);
  });
});

describe("formatDisplayNumber", () => {
  it("trims noise, zeros and negative zero", () => {
    expect(formatDisplayNumber(0.1 * 1000)).toBe("100");
    expect(formatDisplayNumber(12.34567)).toBe("12.346");
    expect(formatDisplayNumber(-0.0001)).toBe("0");
  });
});
