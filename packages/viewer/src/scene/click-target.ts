import type { ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import { conveyorOfKey } from "../conveyors/conveyor-kinds.ts";

// What a click in the 3D view landed on. Bodies and phase 6 objects are picked
// in one pass, so the nearest hit decides and an object behind a body never
// steals its click (ADR 0043 point 13).

export type ClickTarget =
  | { kind: "body"; bodyId: string }
  | { kind: "conveyor"; conveyor: { kind: ConveyorKind; id: string } }
  | { kind: "nothing" };

/** Which body or object the picked mesh belongs to; `null` is a click on the background. */
export function clickTargetOf<Mesh>(
  picked: Mesh | null,
  bodyIdOfMesh: ReadonlyMap<Mesh, string>,
  conveyorKeyOfMesh: (mesh: Mesh) => string | null,
): ClickTarget {
  if (picked === null) {
    return { kind: "nothing" };
  }
  const bodyId = bodyIdOfMesh.get(picked);
  if (bodyId !== undefined) {
    return { kind: "body", bodyId };
  }
  const key = conveyorKeyOfMesh(picked);
  const conveyor = key === null ? null : conveyorOfKey(key);
  return conveyor === null ? { kind: "nothing" } : { kind: "conveyor", conveyor };
}
