import { describe, expect, it } from "vitest";
import type { SensorOutput } from "../evaluation-common.ts";
import { evaluatePresenceSensor } from "../evaluators.ts";
import type { PresenceSensorFields } from "../schemas.ts";

const STEP = 1 / 120;

function cell(change: Partial<PresenceSensorFields> = {}): PresenceSensorFields {
  return {
    type: "photoelectric",
    mode: "diffuse",
    range: 0.6,
    normallyClosed: false,
    onDelay: 0,
    offDelay: 0,
    ...change,
  } as PresenceSensorFields; // Partial of a union keyed by type: only the cell exists.
}

// The `state` tag after each step of `signals` (1 = product seen).
function run(fields: PresenceSensorFields, signals: string): number[] {
  let previous: SensorOutput["state"] | null = null;
  return [...signals].map((signal) => {
    const output = evaluatePresenceSensor({
      fields,
      signal: signal === "1",
      state: previous,
      stepSeconds: STEP,
    });
    previous = output.state;
    return output.values.state ?? Number.NaN;
  });
}

describe("a photoelectric cell without delay", () => {
  it("follows the signal in the same step", () => {
    expect(run(cell(), "0011100")).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });
});

describe("the on delay", () => {
  const fields = cell({ onDelay: 3 * STEP });
  it("holds the switch-on back by whole steps", () => {
    expect(run(fields, "011111100")).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0]);
  });
  it("ignores a flicker no longer than the delay", () => {
    expect(run(fields, "01110111000")).toEqual(Array(11).fill(0));
  });
  it("rounds the delay to the nearest step", () => {
    expect(run(cell({ onDelay: 1.4 * STEP }), "0111")).toEqual([0, 0, 1, 1]);
    expect(run(cell({ onDelay: 1.6 * STEP }), "0111")).toEqual([0, 0, 0, 1]);
  });
});

describe("the off delay", () => {
  const fields = cell({ offDelay: 2 * STEP });
  it("holds the switch-off back by whole steps", () => {
    expect(run(fields, "0110000")).toEqual([0, 1, 1, 1, 1, 0, 0]);
  });
  it("bridges a gap no longer than the delay", () => {
    expect(run(fields, "01001100")).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("a normally closed cell", () => {
  it("inverts the output, from the first step", () => {
    expect(run(cell({ normallyClosed: true }), "0110")).toEqual([1, 0, 0, 1]);
  });
  it("inverts after the delays, which still apply to the beam", () => {
    const fields = cell({ normallyClosed: true, onDelay: 2 * STEP, offDelay: 1 * STEP });
    expect(run(fields, "0111100")).toEqual([1, 1, 1, 0, 0, 0, 1]);
  });
});
