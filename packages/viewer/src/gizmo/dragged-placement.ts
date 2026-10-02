import type { Placement } from "@pantin/protocol";

/** One value of a drag on its way to the core: the assembly it is for, in the frame of its anchor. */
export interface DraggedPlacement {
  pantinId: string;
  key: string;
  placement: Placement;
}
