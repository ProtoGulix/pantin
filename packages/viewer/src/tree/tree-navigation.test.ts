import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  pantinNodeId,
  sourceNodeNodeId,
} from "./node-ids.ts";
import { buildTree } from "./tree-model.ts";
import { commandForKey } from "./tree-navigation.ts";
import { flattenTree } from "./tree-rows.ts";

const press = pantinNodeId("press");
const carriage = bodyNodeId("press", "carriage");
const folder = assemblyNodeId("press", "main");
const jointsFolder = folderNodeId("press", "betweenAssemblies");
const rail = bodyNodeId("press", "rail");
const firstSource = sourceNodeNodeId("press", "rail", 0);

function rows(expanded: string[]) {
  const tree = buildTree(
    { openPantin: pantinResponse(false, [railBody, stepBody("carriage", "N_1")]) },
    createTranslator("en"),
  );
  return flattenTree(tree, {
    expandedNodeIds: new Set(expanded),
    selection: null,
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
    expect(commandForKey(expandedRows, jointsFolder, "ArrowDown")).toEqual({
      type: "select",
      nodeId: jointsFolder,
    });
  });

  it("jumps to the first and last rows", () => {
    expect(commandForKey(expandedRows, rail, "Home")).toEqual({ type: "select", nodeId: press });
    expect(commandForKey(expandedRows, press, "End")).toEqual({
      type: "select",
      nodeId: jointsFolder,
    });
  });

  it("selects the first or last row when nothing is selected", () => {
    expect(commandForKey(expandedRows, null, "ArrowDown")).toEqual({
      type: "select",
      nodeId: press,
    });
    expect(commandForKey(expandedRows, null, "ArrowUp")).toEqual({
      type: "select",
      nodeId: jointsFolder,
    });
    expect(commandForKey(expandedRows, null, "Enter")).toEqual({ type: "none" });
  });
});

describe("commandForKey in depth", () => {
  it("expands a collapsed node with Right, then enters its first child", () => {
    expect(commandForKey(expandedRows, rail, "ArrowRight")).toEqual({
      type: "expand",
      nodeId: rail,
    });
    expect(commandForKey(expandedRows, carriage, "ArrowRight")).toEqual({
      type: "expand",
      nodeId: carriage,
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
    expect(commandForKey(rows([]), press, "ArrowLeft")).toEqual({ type: "none" });
  });

  it("activates with Enter and renames with F2 only what can be renamed, an assembly too", () => {
    expect(commandForKey(expandedRows, carriage, "Enter")).toEqual({
      type: "activate",
      nodeId: carriage,
    });
    expect(commandForKey(expandedRows, rail, "F2")).toEqual({ type: "rename", nodeId: rail });
    expect(commandForKey(expandedRows, folder, "F2")).toEqual({ type: "rename", nodeId: folder });
    expect(commandForKey(expandedRows, jointsFolder, "F2")).toEqual({ type: "none" });
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
