// How a signal reads in the 3D view, for sensor markers and light beams alike
// (ADR 0057 rule 3: one meaning, "signal on"). The colour (the theme's
// state-normal green against a neutral) is not the only cue: an on signal is
// thick and opaque, an off one thin and translucent.

export interface SignalLook {
  /** Multiplies the thickness the marker or beam is drawn with. */
  thicknessScale: number;
  alpha: number;
}

const SIGNAL_ON_LOOK: SignalLook = { thicknessScale: 1.5, alpha: 1 };
const SIGNAL_OFF_LOOK: SignalLook = { thicknessScale: 0.6, alpha: 0.8 };

export function signalLookFor(on: boolean): SignalLook {
  return on ? SIGNAL_ON_LOOK : SIGNAL_OFF_LOOK;
}

export interface SignalColours {
  on: string;
  off: string;
}

export function signalColourFor(on: boolean, colours: SignalColours): string {
  return on ? colours.on : colours.off;
}
