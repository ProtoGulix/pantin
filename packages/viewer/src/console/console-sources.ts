import type { ConsoleSource, PantinDocument } from "@pantin/protocol";
import { type DeviceRef, deviceName } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";
import { bodyNodeId, jointNodeId, pantinNodeId } from "../tree/node-ids.ts";

// The source of a console line (ADR 0031 point 2): what it is called in the
// document, and what a click on the line selects (ADR 0030 point 1).

function elementName(
  document: PantinDocument,
  source: Exclude<ConsoleSource, { kind: "pantin" }>,
): string | null | undefined {
  switch (source.kind) {
    case "joint":
      return document.joints.find((joint) => joint.id === source.id)?.name;
    case "body":
      return document.bodies.find((body) => body.id === source.id)?.name;
    default:
      return deviceName(document, { kind: source.kind, id: source.id });
  }
}

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
  return elementName(document, source) ?? t("console.source.missing", { id: source.id });
}

/**
 * What a click selects: a device is itself the selection, a joint is its row
 * under its child body, a body and the Pantin their rows. Null when the source is gone,
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
  if (source.kind === "body") {
    return elementName(document, source) === undefined
      ? null
      : { kind: "node", nodeId: bodyNodeId(pantinId, source.id) };
  }
  const device: DeviceRef = { kind: source.kind, id: source.id };
  return deviceName(document, device) === null ? null : { kind: "device", device };
}
