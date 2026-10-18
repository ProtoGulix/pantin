import { describe, expect, it } from "vitest";
import { SCENE_PALETTES } from "../theme/scene-palette.ts";
import { beamLookFor, isBeamOn } from "./beam-appearance.ts";

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
  const { signalOn, signalOff } = SCENE_PALETTES.dark;
  const colours = { on: signalOn, off: signalOff };

  it("is the signal-on colour, thick and opaque, when on", () => {
    expect(beamLookFor(true, colours)).toMatchObject({ color: signalOn, alpha: 1 });
  });

  it("is the neutral, thin and translucent, when off", () => {
    const off = beamLookFor(false, colours);
    const on = beamLookFor(true, colours);
    expect(off.color).toBe(signalOff);
    expect(off.alpha).toBeLessThan(on.alpha);
    expect(off.thicknessScale).toBeLessThan(on.thicknessScale);
  });
});
