import { isBitOn } from "../bit-tag.ts";
import {
  type SignalColours,
  type SignalLook,
  signalColourFor,
  signalLookFor,
} from "../theme/signal-look.ts";

// The beam of a presence sensor follows its `state` tag (ADR 0024 points 4 and 5):
// the viewer reads the bit, it never evaluates the sensor. It reads like a
// sensor marker (signal on: green, thick, opaque; off: neutral, thin, translucent).

export interface BeamLook extends SignalLook {
  color: string;
}

/** A missing tag (not read yet) counts as off, like the sensor markers. */
export function isBeamOn(stateTag: string | null, values: ReadonlyMap<string, number>): boolean {
  return stateTag !== null && isBitOn(values.get(stateTag) ?? 0);
}

export function beamLookFor(on: boolean, colours: SignalColours): BeamLook {
  return { color: signalColourFor(on, colours), ...signalLookFor(on) };
}
