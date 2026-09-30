import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  parameterConversionUnit,
  parameterUnitLabel,
  quantityConversionUnit,
  quantityUnitLabel,
} from "./parameter-units.ts";

const translate = createTranslator("fr");

describe("units of drive and actuator values (ADR 0028 point 6)", () => {
  it("shows speeds and accelerations in the unit of the joints", () => {
    expect(parameterUnitLabel("speed", "metre", translate)).toBe("mm/s");
    expect(parameterUnitLabel("acceleration", "metre", translate)).toBe("mm/s²");
    expect(parameterUnitLabel("speed", "radian", translate)).toBe("°/s");
    expect(parameterConversionUnit("speed", "radian")).toBe("radian");
  });

  it("shows a ramp in percent per second, whatever the joints, unconverted", () => {
    expect(parameterUnitLabel("percent_per_second", "radian", translate)).toBe("%/s");
    expect(parameterConversionUnit("percent_per_second", "radian")).toBeNull();
  });

  it("shows percent tags in %, position tags in the joints' unit, bits in none", () => {
    expect(quantityUnitLabel("percent", "metre", translate)).toBe("%");
    expect(quantityConversionUnit("percent", "metre")).toBeNull();
    expect(quantityUnitLabel("position", "metre", translate)).toBe("mm");
    expect(quantityUnitLabel("speed", "metre", translate)).toBe("mm/s");
    expect(quantityUnitLabel(undefined, "metre", translate)).toBeNull();
    expect(quantityConversionUnit(undefined, "metre")).toBeNull();
  });
});
