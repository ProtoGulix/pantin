// The beam of a presence sensor follows its `state` tag (ADR 0024 points 4 and 5):
// the viewer reads the bit, it never evaluates the sensor.

export interface BeamLook {
  color: string;
  alpha: number;
}

export const BEAM_OFF_LOOK: BeamLook = { color: "#8a4a44", alpha: 0.5 };
export const BEAM_ON_LOOK: BeamLook = { color: "#ff5a4d", alpha: 1 };

/** A missing tag (not read yet) counts as off, like the sensor markers. */
export function isBeamOn(stateTag: string | null, values: ReadonlyMap<string, number>): boolean {
  return stateTag !== null && (values.get(stateTag) ?? 0) >= 0.5;
}

export function beamLookFor(on: boolean): BeamLook {
  return on ? BEAM_ON_LOOK : BEAM_OFF_LOOK;
}
