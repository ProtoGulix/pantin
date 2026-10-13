import type { DeviceIcon } from "./device-families.ts";
import type { NodeRef } from "./node-ids.ts";

// The nodes of the tree of the left panel, as plain data (built in tree-model.ts).

export type TreeIcon =
  | "pantin"
  | "assembly"
  | "folder"
  | "body-glb"
  | "body-stl"
  | "body-step"
  | "joint"
  | "source-node"
  | DeviceIcon;

interface JointWiring {
  // Its actuator, if any: a joint has one at most.
  actuatorId: string | null;
  // The sensors watching it, in document order.
  sensorIds: readonly string[];
}

export interface TreeNode {
  id: string;
  kind: NodeRef["kind"];
  icon: TreeIcon;
  label: string;
  // Secondary text after the label (a count, a path), or null.
  detail: string | null;
  // Read-only data from the source file: drawn greyed.
  muted: boolean;
  renamable: boolean;
  // Only assemblies can be hidden in the 3D view: an eye button, not text.
  visibility: "shown" | "hidden" | null;
  // A joint an actuator moves or a sensor watches: a bolt or a sensor mark at the
  // end of its row, like the eye (ADR 0022, ADR 0023); null for other nodes.
  wiring: JointWiring | null;
  // What an icon says (an assembly hidden, a joint driven or watched), for screen readers
  // and as a tooltip; null when there is nothing to say.
  stateLabel: string | null;
  // What kind of element a device row is ("Drive"), for screen readers: the icon says it
  // to the eye. Apart from stateLabel, which slice P2 needs for the on or off mark.
  kindLabel: string | null;
  children: readonly TreeNode[];
}
