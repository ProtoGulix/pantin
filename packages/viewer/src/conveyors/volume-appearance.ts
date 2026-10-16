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

export const VOLUME_LOOKS: Readonly<Record<VolumeStyle, VolumeLook>> = {
  belt: { color: "#2a2d33", alpha: 1, edges: "#4b525e" },
  // A guide collides, so it is nearly solid.
  guide: { color: "#7d6ff0", alpha: 0.75, edges: "#b3a9ff" },
  emitter: { color: "#3fb950", alpha: 0.16, edges: "#56d364" },
  absorber: { color: "#f0883e", alpha: 0.16, edges: "#ffa657" },
  receiver: { color: "#6b3a36", alpha: 1, edges: null },
};

export const ARROW_COLOR = "#e6edf3";
