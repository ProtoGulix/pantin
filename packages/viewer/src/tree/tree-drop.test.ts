import { describe, expect, it } from "vitest";
import { pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, folderNodeId, jointNodeId } from "./node-ids.ts";
import { bodyMoveOf, isDraggableNode, isDropTarget } from "./tree-drop.ts";

// "main" holds the rail, "gripper" the jaw.
const { document } = pantinResponse(false, [
  railBody,
  { ...stepBody("jaw", "Jaw"), assembly: "gripper" },
]);

describe("tree drag and drop of bodies", () => {
  it("drags bodies only, and drops on assemblies and bodies only", () => {
    expect(isDraggableNode(bodyNodeId("press", "rail"))).toBe(true);
    expect(isDraggableNode(assemblyNodeId("press", "main"))).toBe(false);
    expect(isDropTarget(assemblyNodeId("press", "main"))).toBe(true);
    expect(isDropTarget(bodyNodeId("press", "jaw"))).toBe(true);
    expect(isDropTarget(folderNodeId("press", "betweenAssemblies"))).toBe(false);
    expect(isDropTarget(jointNodeId("press", "hinge"))).toBe(false);
  });

  it("moves a body to the assembly dropped on, or to the assembly of the body dropped on", () => {
    const rail = bodyNodeId("press", "rail");
    expect(bodyMoveOf(document, rail, assemblyNodeId("press", "gripper"))).toEqual({
      bodyId: "rail",
      assembly: "gripper",
    });
    expect(bodyMoveOf(document, rail, bodyNodeId("press", "jaw"))).toEqual({
      bodyId: "rail",
      assembly: "gripper",
    });
  });

  it("asks for nothing when the body stays in its assembly or the drop is elsewhere", () => {
    const rail = bodyNodeId("press", "rail");
    expect(bodyMoveOf(document, rail, assemblyNodeId("press", "main"))).toBeNull();
    expect(bodyMoveOf(document, rail, bodyNodeId("press", "rail"))).toBeNull();
    expect(bodyMoveOf(document, rail, folderNodeId("press", "betweenAssemblies"))).toBeNull();
    expect(
      bodyMoveOf(document, assemblyNodeId("press", "main"), bodyNodeId("press", "jaw")),
    ).toBeNull();
  });
});
