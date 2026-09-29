// Stable ids of tree nodes. Pantin and body ids only contain lowercase
// letters, digits and dashes (PantinIdSchema), so ":" can never be part of
// them and is a safe separator.

export type FolderKey = "bodies";

export type NodeRef =
  | { kind: "pantin"; pantinId: string }
  | { kind: "folder"; pantinId: string; folder: FolderKey }
  | { kind: "body"; pantinId: string; bodyId: string }
  | { kind: "sourceNode"; pantinId: string; bodyId: string; index: number };

const FOLDER_KEYS: readonly FolderKey[] = ["bodies"];

export function pantinNodeId(pantinId: string): string {
  return `pantin:${pantinId}`;
}

export function folderNodeId(pantinId: string, folder: FolderKey): string {
  return `folder:${pantinId}:${folder}`;
}

export function bodyNodeId(pantinId: string, bodyId: string): string {
  return `body:${pantinId}:${bodyId}`;
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
  if (kind === "body" && second && third === undefined) {
    return { kind, pantinId, bodyId: second };
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
