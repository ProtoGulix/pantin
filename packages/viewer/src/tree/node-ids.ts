import { type DeviceKind, isDeviceKind } from "../device-selection.ts";

// Stable ids of tree nodes. Ids and keys only contain lowercase letters,
// digits, dashes and underscores (ids.ts in the protocol), so ":" can never be
// part of them and is a safe separator.

// Joints whose two bodies are in different assemblies (ADR 0019 point 13);
// the others are listed under their assembly.
export type FolderKey = "betweenAssemblies";

// The folders of devices under an assembly (ADR 0047 point 2).
export type FamilyKey = "actionChain" | "conveying" | "productFlow";

export type NodeRef =
  | { kind: "pantin"; pantinId: string }
  | { kind: "folder"; pantinId: string; folder: FolderKey }
  | { kind: "assembly"; pantinId: string; key: string }
  | { kind: "body"; pantinId: string; bodyId: string }
  // underBodyId or underGroupKey: the body or the group (an assembly used as a
  // joint end, ADR 0055) under which the joint is listed as well; both null for
  // its entry in the joints folder. All these nodes stand for the same joint.
  | {
      kind: "joint";
      pantinId: string;
      jointId: string;
      underBodyId: string | null;
      underGroupKey: string | null;
    }
  | { kind: "sourceNode"; pantinId: string; bodyId: string; index: number }
  | { kind: "family"; pantinId: string; assemblyKey: string; family: FamilyKey }
  // A drive, an actuator, a sensor or a phase 6 object (ADR 0047 point 4).
  | { kind: "device"; pantinId: string; deviceKind: DeviceKind; id: string };

const FOLDER_KEYS: readonly FolderKey[] = ["betweenAssemblies"];
export const FAMILY_KEYS: readonly FamilyKey[] = ["actionChain", "conveying", "productFlow"];

export function pantinNodeId(pantinId: string): string {
  return `pantin:${pantinId}`;
}

export function folderNodeId(pantinId: string, folder: FolderKey): string {
  return `folder:${pantinId}:${folder}`;
}

export function assemblyNodeId(pantinId: string, key: string): string {
  return `assembly:${pantinId}:${key}`;
}

export function bodyNodeId(pantinId: string, bodyId: string): string {
  return `body:${pantinId}:${bodyId}`;
}

export function jointNodeId(
  pantinId: string,
  jointId: string,
  underBodyId: string | null = null,
): string {
  return underBodyId === null
    ? `joint:${pantinId}:${jointId}`
    : `joint:${pantinId}:${jointId}:${underBodyId}`;
}

// "~" is in no id or key, so a group's entry never reads as a body's.
const GROUP_MARK = "~";

/** The entry of a joint under a group row. */
export function groupJointNodeId(pantinId: string, jointId: string, groupKey: string): string {
  return `joint:${pantinId}:${jointId}:${GROUP_MARK}${groupKey}`;
}

export function sourceNodeNodeId(pantinId: string, bodyId: string, index: number): string {
  return `source:${pantinId}:${bodyId}:${index}`;
}

export function familyNodeId(pantinId: string, assemblyKey: string, family: FamilyKey): string {
  return `family:${pantinId}:${assemblyKey}:${family}`;
}

export function deviceRowId(pantinId: string, kind: DeviceKind, id: string): string {
  return `device:${pantinId}:${kind}:${id}`;
}

function parseFolder(pantinId: string, folder: string): NodeRef | null {
  const known = FOLDER_KEYS.find((key) => key === folder);
  return known === undefined ? null : { kind: "folder", pantinId, folder: known };
}

function parseFamily(pantinId: string, assemblyKey: string, family: string): NodeRef | null {
  const known = FAMILY_KEYS.find((key) => key === family);
  return known === undefined ? null : { kind: "family", pantinId, assemblyKey, family: known };
}

function jointRef(pantinId: string, jointId: string, third: string | undefined): NodeRef | null {
  if (third === GROUP_MARK) {
    return null;
  }
  const groupKey = third?.startsWith(GROUP_MARK) ? third.slice(GROUP_MARK.length) : null;
  return {
    kind: "joint",
    pantinId,
    jointId,
    underBodyId: groupKey === null ? (third ?? null) : null,
    underGroupKey: groupKey,
  };
}

export function parseNodeId(nodeId: string): NodeRef | null {
  const [kind, pantinId, second, third, ...rest] = nodeId.split(":");
  if (pantinId === undefined || pantinId === "" || rest.length > 0) {
    return null;
  }
  if (kind === "pantin" && second === undefined) {
    return { kind, pantinId };
  }
  if (kind === "folder" && second !== undefined && third === undefined) {
    return parseFolder(pantinId, second);
  }
  if (kind === "assembly" && second && third === undefined) {
    return { kind, pantinId, key: second };
  }
  if (kind === "body" && second && third === undefined) {
    return { kind, pantinId, bodyId: second };
  }
  if (kind === "joint" && second && third !== "") {
    return jointRef(pantinId, second, third);
  }
  if (kind === "source" && second && third !== undefined && /^\d+$/.test(third)) {
    return { kind: "sourceNode", pantinId, bodyId: second, index: Number(third) };
  }
  if (kind === "family" && second && third) {
    return parseFamily(pantinId, second, third);
  }
  if (kind === "device" && second && isDeviceKind(second) && third) {
    return { kind, pantinId, deviceKind: second, id: third };
  }
  return null;
}

/** The body a node stands for: itself, or the body owning a source node. */
export function bodyIdOfNode(nodeId: string | null): string | null {
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  return ref?.kind === "body" || ref?.kind === "sourceNode" ? ref.bodyId : null;
}
