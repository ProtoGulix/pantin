import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, pantinSummaries } from "../test-fixtures.ts";
import { bodyNodeId, folderNodeId, pantinNodeId, sourceNodeNodeId } from "./node-ids.ts";
import { buildTree, flattenTree } from "./tree-model.ts";
import { commandForKey } from "./tree-navigation.ts";

const press = pantinNodeId("press");
const robot = pantinNodeId("robot");
const folder = folderNodeId("press", "bodies");
const rail = bodyNodeId("press", "rail");
const firstSource = sourceNodeNodeId("press", "rail", 0);

function rows(expanded: string[]) {
  const tree = buildTree(
    { pantins: pantinSummaries, openPantin: pantinResponse(false) },
    createTranslator("en"),
  );
  return flattenTree(tree, {
    expandedNodeIds: new Set(expanded),
    selectedNodeId: null,
    renamingNodeId: null,
  });
}

const expandedRows = rows([press, folder]);

describe("commandForKey", () => {
  it("moves down and up, and stays at the ends", () => {
    expect(commandForKey(expandedRows, press, "ArrowDown")).toEqual({
      type: "select",
      nodeId: folder,
    });
    expect(commandForKey(expandedRows, folder, "ArrowUp")).toEqual({
      type: "select",
      nodeId: press,
    });
    expect(commandForKey(expandedRows, press, "ArrowUp")).toEqual({
      type: "select",
      nodeId: press,
    });
    expect(commandForKey(expandedRows, robot, "ArrowDown")).toEqual({
      type: "select",
      nodeId: robot,
    });
  });

  it("jumps to the first and last rows", () => {
    expect(commandForKey(expandedRows, rail, "Home")).toEqual({ type: "select", nodeId: press });
    expect(commandForKey(expandedRows, press, "End")).toEqual({ type: "select", nodeId: robot });
  });

  it("selects the first or last row when nothing is selected", () => {
    expect(commandForKey(expandedRows, null, "ArrowDown")).toEqual({
      type: "select",
      nodeId: press,
    });
    expect(commandForKey(expandedRows, null, "ArrowUp")).toEqual({ type: "select", nodeId: robot });
    expect(commandForKey(expandedRows, null, "Enter")).toEqual({ type: "none" });
  });
});

describe("commandForKey in depth", () => {
  it("expands a collapsed node with Right, then enters its first child", () => {
    expect(commandForKey(expandedRows, rail, "ArrowRight")).toEqual({
      type: "expand",
      nodeId: rail,
    });
    expect(commandForKey(expandedRows, robot, "ArrowRight")).toEqual({
      type: "expand",
      nodeId: robot,
    });
    expect(commandForKey(expandedRows, folder, "ArrowRight")).toEqual({
      type: "select",
      nodeId: rail,
    });
  });

  it("does nothing with Right on a leaf", () => {
    const withSources = rows([press, folder, rail]);
    expect(commandForKey(withSources, firstSource, "ArrowRight")).toEqual({ type: "none" });
  });

  it("collapses an expanded node with Left, otherwise goes to the parent", () => {
    expect(commandForKey(expandedRows, folder, "ArrowLeft")).toEqual({
      type: "collapse",
      nodeId: folder,
    });
    expect(commandForKey(expandedRows, rail, "ArrowLeft")).toEqual({
      type: "select",
      nodeId: folder,
    });
    expect(commandForKey(expandedRows, robot, "ArrowLeft")).toEqual({ type: "none" });
  });

  it("activates with Enter and renames with F2 only what can be renamed", () => {
    expect(commandForKey(expandedRows, robot, "Enter")).toEqual({
      type: "activate",
      nodeId: robot,
    });
    expect(commandForKey(expandedRows, rail, "F2")).toEqual({ type: "rename", nodeId: rail });
    expect(commandForKey(expandedRows, folder, "F2")).toEqual({ type: "none" });
  });

  it("opens the context menu from the keyboard", () => {
    expect(commandForKey(expandedRows, rail, "ContextMenu")).toEqual({
      type: "contextMenu",
      nodeId: rail,
    });
  });

  it("ignores other keys", () => {
    expect(commandForKey(expandedRows, rail, "a")).toEqual({ type: "none" });
  });
});
