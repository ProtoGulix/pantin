import { SENSOR_PARAMETERS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { defaultTexts, parameterKeys, parameterTexts, parameterValue } from "./parameter-texts.ts";

// Sensor parameters as form texts and back (ADR 0025 point 4).

const inductive = SENSOR_PARAMETERS.inductive_switch;
const parameter = (field: string) => {
  const found = inductive.find((candidate) => candidate.field === field);
  if (found === undefined) {
    throw new Error(`No parameter "${field}".`);
  }
  return found;
};

describe("parameter texts", () => {
  it("shows a position along a slider in mm and sends it in metres", () => {
    const face = parameter("facePosition");
    expect(parameterTexts(face, 0.1, "metre")).toEqual(["100"]);
    expect(parameterValue(face, { facePosition: "96" }, "metre")).toBeCloseTo(0.096, 12);
  });

  it("keeps a percentage and a choice as typed", () => {
    expect(
      parameterValue(parameter("hysteresisPercent"), { hysteresisPercent: "10" }, "metre"),
    ).toBe(10);
    expect(parameterTexts(parameter("material"), "brass", "metre")).toEqual(["brass"]);
    expect(parameterValue(parameter("material"), { material: "brass" }, "metre")).toBe("brass");
  });

  it("starts a choice on its first option and a flag unset", () => {
    expect(defaultTexts(parameter("approach"))).toEqual({ approach: "increasing" });
    expect(defaultTexts(parameter("normallyClosed"))).toEqual({ normallyClosed: "false" });
    expect(defaultTexts(parameter("nominalDistance"))).toEqual({});
  });

  it("gives a range two inputs and any other parameter one", () => {
    const range = SENSOR_PARAMETERS.position_switch[0];
    expect(range === undefined ? [] : parameterKeys(range)).toEqual(["range.lower", "range.upper"]);
    expect(parameterKeys(parameter("material"))).toEqual(["material"]);
  });
});
