import { type ConveyorVolumeColours, DATA_COLOURS, VOLUME_ALPHAS } from "../theme/data-palette.ts";
import type { VolumeStyle } from "./conveyor-drawing.ts";

// Looks of the outlined volumes. The colours are neutral greys that follow the
// theme (ADR 0057); an emitter and an absorber are told apart by their glyph
// (volume-glyph.ts), a guide by being nearly solid; the belt is a slab that lets
// products and the arrow stand out.

export interface VolumeLook {
  color: string;
  alpha: number;
  // Edges are drawn when set.
  edges: string | null;
}

export function volumeLooksFor(colours: ConveyorVolumeColours): Record<VolumeStyle, VolumeLook> {
  const look = (style: VolumeStyle): VolumeLook => ({
    ...colours[style],
    alpha: VOLUME_ALPHAS[style],
  });
  return {
    belt: look("belt"),
    guide: look("guide"),
    emitter: look("emitter"),
    absorber: look("absorber"),
    receiver: look("receiver"),
  };
}

export const ARROW_COLOR = DATA_COLOURS.conveyorArrow;
