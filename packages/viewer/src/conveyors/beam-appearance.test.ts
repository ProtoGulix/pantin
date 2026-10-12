import { describe, expect, it } from "vitest";
import { BEAM_OFF_LOOK, BEAM_ON_LOOK, beamLookFor, isBeamOn } from "./beam-appearance.ts";

describe("isBeamOn", () => {
  const values = new Map([["line.cell.state", 1]]);

  it("is on when the state tag reads 1", () => {
    expect(isBeamOn("line.cell.state", values)).toBe(true);
  });

  it("is off on 0, on a tag not read yet and without a tag", () => {
    expect(isBeamOn("line.cell.state", new Map([["line.cell.state", 0]]))).toBe(false);
    expect(isBeamOn("line.other.state", values)).toBe(false);
    expect(isBeamOn(null, values)).toBe(false);
  });
});

describe("beamLookFor", () => {
  it("is dim off and bright on", () => {
    expect(beamLookFor(false)).toBe(BEAM_OFF_LOOK);
    expect(beamLookFor(true)).toBe(BEAM_ON_LOOK);
    expect(BEAM_ON_LOOK.alpha).toBeGreaterThan(BEAM_OFF_LOOK.alpha);
  });
});
