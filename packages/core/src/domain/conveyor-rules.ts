import type { PantinDocument } from "@pantin/protocol";
import { ApiError } from "../errors.ts";

// What a body or a joint may not lose or change while phase 6 objects rely on
// it (ADR 0043 points 2 and 12). Pure; the conflict names every user so that
// the message says what to move or delete first.

/** The objects that follow `bodyId`, e.g. `belt "feed"`, in document order. */
export function framedUsersOfBody(document: PantinDocument, bodyId: string): string[] {
  const lists = [
    ["belt", document.belts],
    ["guide", document.guides],
    ["emitter", document.emitters],
    ["absorber", document.absorbers],
    ["presence sensor", document.presenceSensors],
  ] as const;
  return lists.flatMap(([label, items]) =>
    items.filter((item) => item.body === bodyId).map((item) => `${label} "${item.id}"`),
  );
}

/** Refuses a change that would leave an object following a body it no longer can. */
export function refuseBodyUsedAsFrame(document: PantinDocument, bodyId: string, change: string) {
  const users = framedUsersOfBody(document, bodyId);
  if (users.length > 0) {
    throw new ApiError(
      "conflict",
      `Body "${bodyId}" cannot ${change}: it is the frame of ${users.join(", ")}. Detach or delete ${users.length === 1 ? "it" : "them"} first.`,
    );
  }
}

/** Refuses a change that would leave a belt without a continuous drum joint. */
export function refuseDrumJointLoss(document: PantinDocument, jointId: string, change: string) {
  const belts = document.belts.filter((belt) => belt.drumJoint === jointId);
  if (belts.length > 0) {
    const names = belts.map((belt) => `"${belt.id}"`).join(", ");
    throw new ApiError(
      "conflict",
      `Joint "${jointId}" cannot ${change}: it is the drum of belt ${names}. Point the belt at another continuous joint, or delete it, first.`,
    );
  }
}
