import type { PantinDocument } from "@pantin/protocol";
import { parseNodeId } from "./node-ids.ts";

// Moving a body to another assembly by dragging it in the tree (ADR 0019
// point 9), as pure functions; the drag events live in ui/tree-drag.ts.
// The properties grid's "Assembly" select does the same from the keyboard.

/** Only bodies are dragged: a body is what belongs to an assembly. */
export function isDraggableNode(nodeId: string): boolean {
  return parseNodeId(nodeId)?.kind === "body";
}

/** An assembly, or a body standing for its own assembly. */
export function isDropTarget(nodeId: string): boolean {
  const kind = parseNodeId(nodeId)?.kind;
  return kind === "assembly" || kind === "body";
}

/** The move a drop asks for, or null when it changes nothing. */
export function bodyMoveOf(
  document: PantinDocument,
  draggedNodeId: string,
  targetNodeId: string,
): { bodyId: string; assembly: string } | null {
  const dragged = parseNodeId(draggedNodeId);
  const target = parseNodeId(targetNodeId);
  if (dragged?.kind !== "body" || target === null) {
    return null;
  }
  const assemblyOf = (bodyId: string) =>
    document.bodies.find((body) => body.id === bodyId)?.assembly;
  const assembly =
    target.kind === "assembly"
      ? target.key
      : target.kind === "body"
        ? assemblyOf(target.bodyId)
        : undefined;
  const current = assemblyOf(dragged.bodyId);
  return assembly === undefined || current === undefined || assembly === current
    ? null
    : { bodyId: dragged.bodyId, assembly };
}
