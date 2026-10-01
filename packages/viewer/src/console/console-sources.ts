import type { ConsoleSource, PantinDocument } from "@pantin/protocol";
import { type DeviceRef, deviceName } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";
import { jointNodeId, pantinNodeId } from "../tree/node-ids.ts";

// The source of a console line (ADR 0031 point 2): what it is called in the
// document, and what a click on the line selects (ADR 0030 point 1).

export type ConsoleSourceTarget =
  | { kind: "device"; device: DeviceRef }
  | { kind: "node"; nodeId: string };

/** The source's name in the document; its id, marked, once it no longer exists. */
export function consoleSourceLabel(
  document: PantinDocument,
  source: ConsoleSource,
  t: Translate,
): string {
  if (source.kind === "pantin") {
    return document.name;
  }
  const name =
    source.kind === "joint"
      ? document.joints.find((joint) => joint.id === source.id)?.name
      : deviceName(document, { kind: source.kind, id: source.id });
  return name ?? t("console.source.missing", { id: source.id });
}

/**
 * What a click selects: a device is itself the selection, a joint is its row
 * under its child body, the Pantin its root row. Null when the source is gone,
 * since a deleted element leaves lines behind.
 */
export function consoleSourceTarget(
  document: PantinDocument,
  pantinId: string,
  source: ConsoleSource,
): ConsoleSourceTarget | null {
  if (source.kind === "pantin") {
    return { kind: "node", nodeId: pantinNodeId(pantinId) };
  }
  if (source.kind === "joint") {
    const joint = document.joints.find((candidate) => candidate.id === source.id);
    return joint === undefined
      ? null
      : { kind: "node", nodeId: jointNodeId(pantinId, joint.id, joint.child) };
  }
  const device: DeviceRef = { kind: source.kind, id: source.id };
  return deviceName(document, device) === null ? null : { kind: "device", device };
}
