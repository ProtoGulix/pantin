import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { assemblyNodeId, bodyNodeId, groupJointNodeId, jointNodeId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";
import { nodeExists, withRevealedNode } from "./tree-state.ts";

// Group rows list the joints whose end is that group (ADR 0055 point 12), and
// a body is never listed through the group's stand-in.

const document = documentOf({
  assemblies: ["a", "tool"],
  bodies: [bodyOf("handle", "tool"), bodyOf("alone", "a")],
  joints: [
    {
      ...jointOf("grip", "x", "fixed"),
      parent: bodyEndpoint("alone"),
      child: groupEndpoint("tool"),
    },
  ],
});
const source = {
  language: "fr" as const,
  openPantin: { id: "press", unsavedChanges: false, document },
};
const translate = createTranslator("fr");

describe("joints under a group row", () => {
  const tree = buildTree(source, translate);

  it("lists the joint under the group, as its child", () => {
    const group = findNode(tree, assemblyNodeId("press", "tool"));
    const entry = group?.children.find((node) => node.kind === "joint");
    expect(entry).toMatchObject({
      id: groupJointNodeId("press", "grip", "tool"),
      label: "grip",
      detail: "Fixe, enfant",
    });
  });

  it("lists it under its parent body, and not under the group's stand-in body", () => {
    const alone = findNode(tree, bodyNodeId("press", "alone"));
    expect(alone?.children[0]?.id).toBe(jointNodeId("press", "grip", "alone"));
    const handle = findNode(tree, bodyNodeId("press", "handle"));
    expect(handle?.children.some((node) => node.kind === "joint")).toBe(false);
  });

  it("exists while the group still holds the joint, and unfolds the group to reveal it", () => {
    const id = groupJointNodeId("press", "grip", "tool");
    expect(nodeExists(source, id)).toBe(true);
    expect(nodeExists(source, groupJointNodeId("press", "grip", "a"))).toBe(false);
    const revealed = withRevealedNode(
      {
        ...source,
        expandedNodeIds: new Set<string>(),
        selection: null,
        multiSelectedNodeIds: [],
        renamingNodeId: null,
      },
      id,
    );
    expect(selectedNodeIdOf(revealed.selection)).toBe(id);
    expect(revealed.expandedNodeIds.has(assemblyNodeId("press", "tool"))).toBe(true);
  });
});

describe("a joint between a group and its own body", () => {
  it("is listed once under the group, in its internal joints", () => {
    const inner = documentOf({
      assemblies: ["tool"],
      bodies: [bodyOf("ring", "tool")],
      joints: [
        {
          ...jointOf("turn", "ring", "fixed"),
          parent: groupEndpoint("tool"),
          child: bodyEndpoint("ring"),
        },
      ],
    });
    const tree = buildTree(
      { language: "fr", openPantin: { id: "press", unsavedChanges: false, document: inner } },
      translate,
    );
    const group = findNode(tree, assemblyNodeId("press", "tool"));
    expect(group?.children.filter((node) => node.kind === "joint")).toHaveLength(1);
  });
});
