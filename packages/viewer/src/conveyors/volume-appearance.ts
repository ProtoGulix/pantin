import { DATA_COLOURS } from "../theme/data-palette.ts";
import type { VolumeStyle } from "./conveyor-drawing.ts";

// Colours of the outlined volumes. Each kind of object has its own hue so that
// an emitter, an absorber and a guide read apart at a glance; the belt is a
// dark slab that lets products and the arrow stand out.

export interface VolumeLook {
  color: string;
  alpha: number;
  // Edges are drawn when set.
  edges: string | null;
}

const VOLUMES = DATA_COLOURS.conveyorVolume;

export const VOLUME_LOOKS: Readonly<Record<VolumeStyle, VolumeLook>> = {
  belt: { ...VOLUMES.belt, alpha: 1 },
  // A guide collides, so it is nearly solid.
  guide: { ...VOLUMES.guide, alpha: 0.75 },
  emitter: { ...VOLUMES.emitter, alpha: 0.16 },
  absorber: { ...VOLUMES.absorber, alpha: 0.16 },
  receiver: { ...VOLUMES.receiver, alpha: 1 },
};

export const ARROW_COLOR = DATA_COLOURS.conveyorArrow;
