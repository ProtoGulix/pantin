// Stable ids of tree nodes. Ids and keys only contain lowercase letters,
// digits, dashes and underscores (ids.ts in the protocol), so ":" can never be
// part of them and is a safe separator.

// Joints whose two bodies are in different assemblies (ADR 0019 point 13);
// the others are listed under their assembly.
export type FolderKey = "betweenAssemblies";

export type NodeRef =
  | { kind: "pantin"; pantinId: string }
  | { kind: "folder"; pantinId: string; folder: FolderKey }
  | { kind: "assembly"; pantinId: string; key: string }
  | { kind: "body"; pantinId: string; bodyId: string }
  // underBodyId: the body under which the joint is listed as well, or null
  // for its entry in the joints folder. Both nodes stand for the same joint.
  | { kind: "joint"; pantinId: string; jointId: string; underBodyId: string | null }
  | { kind: "sourceNode"; pantinId: string; bodyId: string; index: number };

const FOLDER_KEYS: readonly FolderKey[] = ["betweenAssemblies"];

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

export function sourceNodeNodeId(pantinId: string, bodyId: string, index: number): string {
  return `source:${pantinId}:${bodyId}:${index}`;
}

function parseFolder(pantinId: string, folder: string): NodeRef | null {
  const known = FOLDER_KEYS.find((key) => key === folder);
  return known === undefined ? null : { kind: "folder", pantinId, folder: known };
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
    return { kind, pantinId, jointId: second, underBodyId: third ?? null };
  }
  if (kind === "source" && second && third !== undefined && /^\d+$/.test(third)) {
    return { kind: "sourceNode", pantinId, bodyId: second, index: Number(third) };
  }
  return null;
}

/** The body a node stands for: itself, or the body owning a source node. */
export function bodyIdOfNode(nodeId: string | null): string | null {
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  return ref?.kind === "body" || ref?.kind === "sourceNode" ? ref.bodyId : null;
}
