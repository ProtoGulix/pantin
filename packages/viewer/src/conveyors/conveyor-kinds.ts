import type {
  Absorber,
  Belt,
  Emitter,
  Guide,
  PantinDocument,
  PresenceSensor,
} from "@pantin/protocol";

// The five kinds of phase 6 objects (ADR 0043 point 2), as the selection, the
// forms, the inspector and the 3D picking name them. The strings are the ones
// of the pose stream's `objects` (ObjectPose["kind"]).

export const CONVEYOR_KINDS = ["belt", "guide", "emitter", "absorber", "presenceSensor"] as const;
export type ConveyorKind = (typeof CONVEYOR_KINDS)[number];

export interface ConveyorItems {
  belt: Belt;
  guide: Guide;
  emitter: Emitter;
  absorber: Absorber;
  presenceSensor: PresenceSensor;
}

/** The member of an emitter's tag that asks for one product (ADR 0043 point 5). */
export const SPAWN_MEMBER = "spawn";

export function isConveyorKind(kind: string): kind is ConveyorKind {
  return (CONVEYOR_KINDS as readonly string[]).includes(kind);
}

// One reader per kind; the mapped type keeps each kind tied to its own items.
const READERS: {
  [Kind in ConveyorKind]: (document: PantinDocument) => readonly ConveyorItems[Kind][];
} = {
  belt: (document) => document.belts,
  guide: (document) => document.guides,
  emitter: (document) => document.emitters,
  absorber: (document) => document.absorbers,
  presenceSensor: (document) => document.presenceSensors,
};

/** Every object of a kind, in document order. */
export function conveyorsOf<Kind extends ConveyorKind>(
  document: PantinDocument,
  kind: Kind,
): readonly ConveyorItems[Kind][] {
  return READERS[kind](document);
}

export function findConveyor<Kind extends ConveyorKind>(
  document: PantinDocument,
  kind: Kind,
  id: string,
): ConveyorItems[Kind] | undefined {
  return conveyorsOf(document, kind).find((item) => item.id === id);
}

/** The object a "kind:id" key (pose-feed.ts objectKey) names, or null for anything else. */
export function conveyorOfKey(key: string): { kind: ConveyorKind; id: string } | null {
  const separator = key.indexOf(":");
  const kind = key.slice(0, separator);
  return separator > 0 && isConveyorKind(kind) ? { kind, id: key.slice(separator + 1) } : null;
}
