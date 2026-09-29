import { isDraggableNode, isDropTarget } from "../tree/tree-drop.ts";

// Drag and drop of bodies in the tree, native HTML5 events only. The rows
// carry their node id; what a drop means is decided by tree-drop.ts and the
// controller.

const NODE_TYPE = "application/x-pantin-node";
const DROP_CLASS = "tree-row--drop-target";

function rowNodeId(target: EventTarget | null): { row: Element; nodeId: string } | null {
  const row = target instanceof Element ? target.closest("[role=treeitem]") : null;
  const nodeId = row?.getAttribute("data-node-id");
  return row && nodeId ? { row, nodeId } : null;
}

function clearDropMarks(tree: HTMLElement): void {
  for (const row of tree.querySelectorAll(`.${DROP_CLASS}`)) {
    row.classList.remove(DROP_CLASS);
  }
}

export function listenToDrags(
  tree: HTMLElement,
  onDrop: (draggedNodeId: string, targetNodeId: string) => void,
): void {
  // Kept here because the data of a drag cannot be read before the drop.
  let draggedNodeId: string | null = null;
  tree.addEventListener("dragstart", (event) => {
    const hit = rowNodeId(event.target);
    if (hit === null || !isDraggableNode(hit.nodeId) || event.dataTransfer === null) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(NODE_TYPE, hit.nodeId);
    draggedNodeId = hit.nodeId;
    event.dataTransfer.effectAllowed = "move";
  });
  tree.addEventListener("dragover", (event) => {
    const hit = rowNodeId(event.target);
    // The dragged row itself is no target.
    if (
      hit === null ||
      !isDropTarget(hit.nodeId) ||
      hit.nodeId === draggedNodeId ||
      !event.dataTransfer?.types.includes(NODE_TYPE)
    ) {
      return;
    }
    event.preventDefault();
    clearDropMarks(tree);
    hit.row.classList.add(DROP_CLASS);
  });
  tree.addEventListener("dragleave", () => clearDropMarks(tree));
  tree.addEventListener("dragend", () => {
    draggedNodeId = null;
    clearDropMarks(tree);
  });
  tree.addEventListener("drop", (event) => {
    clearDropMarks(tree);
    const hit = rowNodeId(event.target);
    const dragged = event.dataTransfer?.getData(NODE_TYPE) ?? "";
    if (hit !== null && dragged !== "") {
      event.preventDefault();
      onDrop(dragged, hit.nodeId);
    }
  });
}
