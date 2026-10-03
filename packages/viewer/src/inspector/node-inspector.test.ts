import { describe, expect, it } from "vitest";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { initialJointForm } from "../joints/joint-form.ts";
import type { PropertyGroup, PropertyRow } from "../properties/property-rows.ts";
import { withNode } from "../test-fixtures.ts";
import {
  assemblyNodeId,
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  pantinNodeId,
  sourceNodeNodeId,
} from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildInspectorView } from "./inspector-model.ts";

// The properties of tree nodes in the inspector (ADR 0030 point 2, second
// step): the groups the left panel used to show, then the live ones.

const t = createTranslator("en");

// Assembly a: a valve, a cylinder moving j1, an encoder; j3 is fixed.
const document = documentOf({
  assemblies: ["a", "b"],
  bodies: [
    {
      ...bodyOf("s1", "a"),
      source: { ...bodyOf("s1", "a").source, nodes: [{ name: "N", path: [0] }] },
    },
    bodyOf("s2", "b"),
    bodyOf("s3", "b"),
  ],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2"), jointOf("j3", "s3", "fixed")],
  drives: [driveOf("v1", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
  sensors: [encoderOf("e1", "a", "j1")],
});
const opened = withOpenPantin(initialViewerState("en"), {
  id: "press",
  unsavedChanges: false,
  document,
});

const viewOf = (nodeId: string, state: ViewerState = opened) =>
  buildInspectorView(withNode(state, nodeId), t);
const ids = (groups: PropertyGroup[]) => groups.map((group) => group.id);
const rowsOf = (groups: PropertyGroup[], id: string): PropertyRow[] =>
  groups.find((group) => group.id === id)?.rows ?? [];
const rowOf = (groups: PropertyGroup[], groupId: string, rowId: string) =>
  rowsOf(groups, groupId).find((row) => row.id === rowId);

describe("inspector of the Pantin", () => {
  const view = viewOf(pantinNodeId("press"));

  it("shows its properties, then the index of its devices", () => {
    expect(ids(view.groups)).toEqual(["general", "driveIndex", "actuatorIndex", "sensorIndex"]);
    expect(view.subject).toBe(document.name);
  });

  it("renames it in place, as the tree does", () => {
    expect(rowOf(view.groups, "general", "name")?.edit).toEqual({
      input: "text",
      target: { kind: "rename", nodeId: pantinNodeId("press") },
    });
  });
});

describe("inspector of an assembly", () => {
  const view = viewOf(assemblyNodeId("press", "b"));

  it("shows its properties and the hints of the families it has no device of", () => {
    expect(ids(view.groups)).toEqual(["general"]);
    expect(view.subject).toBe(document.assemblies[1]?.name);
    expect(view.hints).toHaveLength(3);
  });

  it("edits its key, which prefixes the tags", () => {
    expect(rowOf(view.groups, "general", "key")?.edit).toEqual({
      input: "text",
      target: { kind: "assemblyKey", pantinId: "press", key: "b" },
    });
  });

  it("limits the index to its own devices", () => {
    expect(ids(viewOf(assemblyNodeId("press", "a")).groups)).toEqual([
      "general",
      "driveIndex",
      "actuatorIndex",
      "sensorIndex",
    ]);
  });
});

describe("inspector of the folder between assemblies", () => {
  it("shows its read-only properties and no device index", () => {
    const view = viewOf(folderNodeId("press", "betweenAssemblies"));
    expect(ids(view.groups)).toEqual(["general"]);
    expect(rowOf(view.groups, "general", "name")?.edit).toBeNull();
    expect(view.hints).toEqual([]);
    expect(view.note).toBeNull();
  });
});

describe("inspector of a body", () => {
  const view = viewOf(bodyNodeId("press", "s1"));

  it("shows its groups, with its joints as links to the tree", () => {
    expect(ids(view.groups)).toEqual(["general", "joints", "source", "mesh", "sourceNodes"]);
    expect(rowsOf(view.groups, "joints").map((row) => row.link)).toEqual([
      { kind: "node", nodeId: jointNodeId("press", "j1") },
    ]);
  });

  it("renames it, and moves it to another assembly, with the same targets as before", () => {
    expect(rowOf(view.groups, "general", "name")?.edit).toEqual({
      input: "text",
      target: { kind: "rename", nodeId: bodyNodeId("press", "s1") },
    });
    expect(rowOf(view.groups, "general", "assembly")?.edit).toMatchObject({
      input: "select",
      target: { kind: "bodyAssembly", pantinId: "press", bodyId: "s1" },
    });
  });

  it("has no slider and no live value", () => {
    expect([view.jointSlider, view.live.size]).toEqual([null, 0]);
  });
});

describe("inspector of a source node", () => {
  it("shows its read-only properties", () => {
    const view = viewOf(sourceNodeNodeId("press", "s1", 0));
    expect(ids(view.groups)).toEqual(["general"]);
    expect(rowsOf(view.groups, "general").every((row) => row.edit === null && row.muted)).toBe(
      true,
    );
  });
});

describe("inspector of a joint", () => {
  const view = viewOf(jointNodeId("press", "j1"));

  it("shows its properties, then its position, fault and links", () => {
    expect(ids(view.groups)).toEqual(["general", "placement", "parameters", "position", "links"]);
    expect(view.live.has("position/position")).toBe(true);
  });

  it("edits its fields, tag key and type with the same targets as before", () => {
    const target = (fieldId: string) => ({
      input: "text",
      target: { kind: "jointField", pantinId: "press", jointId: "j1", fieldId },
    });
    expect(rowOf(view.groups, "general", "name")?.edit).toEqual(target("name"));
    expect(rowOf(view.groups, "general", "tagKey")?.edit).toEqual({
      input: "text",
      target: { kind: "tagKey", pantinId: "press", jointId: "j1" },
    });
    expect(rowOf(view.groups, "general", "type")?.edit).toMatchObject({
      input: "select",
      target: { kind: "jointType", pantinId: "press", jointId: "j1" },
    });
    expect(rowOf(view.groups, "general", "parent")?.edit).toMatchObject({
      target: { kind: "jointField", fieldId: "parent" },
    });
  });

  it("lists the components of a custom axis, chosen in the grid", () => {
    const custom = viewOf(jointNodeId("press", "j1"), {
      ...opened,
      customAxisJointIds: new Set(["j1"]),
    });
    expect(rowsOf(custom.groups, "placement").some((row) => row.id === "axis.x")).toBe(true);
    expect(rowsOf(view.groups, "placement").some((row) => row.id === "axis.x")).toBe(false);
  });

  it("carries the slider of a joint that moves, and none for a fixed joint", () => {
    expect(view.jointSlider).toMatchObject({ pantinId: "press", jointId: "j1" });
    const fixed = viewOf(jointNodeId("press", "j3"));
    expect(fixed.jointSlider).toBeNull();
    expect(ids(fixed.groups)).toEqual(["general", "placement"]);
  });

  it("carries the joint form being filled", () => {
    const form = initialJointForm(document.bodies);
    expect(buildInspectorView({ ...opened, jointForm: form }, t).jointForm).not.toBeNull();
    expect(view.jointForm).toBeNull();
  });
});

describe("positioning section and joint titles (ADR 0039)", () => {
  it("puts the placement fields in the section, not in the grid, for an assembly", () => {
    const view = viewOf(assemblyNodeId("press", "b"));
    expect(view.positioning?.group?.rows).toHaveLength(7);
    expect(view.groups.map((group) => group.id)).not.toContain("assemblyPlacement");
  });

  it("has a section for a body, none for a joint or the Pantin", () => {
    expect(viewOf(bodyNodeId("press", "s1")).positioning?.bodyLine).toContain(
      "Placed with the assembly",
    );
    expect(viewOf(jointNodeId("press", "j1")).positioning).toBeNull();
    expect(viewOf(pantinNodeId("press")).positioning).toBeNull();
  });

  it("gives a joint distinct titles for its frame and its live position", () => {
    const titles = viewOf(jointNodeId("press", "j1")).groups.map((group) => group.title);
    expect(titles).toContain("Joint frame");
    expect(titles).toContain("Position");
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("collapsed groups, by stable id", () => {
  const folded = (state: ViewerState, ...groupIds: string[]) => ({
    ...state,
    collapsedPropertyGroups: new Set(groupIds),
  });
  const collapsedIds = (view: ReturnType<typeof buildInspectorView>) =>
    view.groups.filter((group) => group.collapsed).map((group) => group.id);

  it("keeps General folded across tree kinds and devices, which share the group on purpose", () => {
    const state = folded(opened, "general");
    const kinds = [
      buildInspectorView(withNode(state, pantinNodeId("press")), t),
      buildInspectorView(withNode(state, bodyNodeId("press", "s1")), t),
      buildInspectorView(withNode(state, jointNodeId("press", "j1")), t),
      buildInspectorView(withSelection(state, { kind: "drive", id: "v1" }), t),
    ];
    expect(kinds.map(collapsedIds)).toEqual([["general"], ["general"], ["general"], ["general"]]);
  });

  it("does not fold a group of another kind that merely sits beside it", () => {
    // A body's joints, and a joint's links, are different groups with different ids.
    const state = folded(opened, "joints");
    expect(collapsedIds(buildInspectorView(withNode(state, bodyNodeId("press", "s1")), t))).toEqual(
      ["joints"],
    );
    expect(
      collapsedIds(buildInspectorView(withNode(state, jointNodeId("press", "j1")), t)),
    ).toEqual([]);
  });
});

describe("inspector closed", () => {
  it("hides the properties of tree nodes with the panel: it is the only one", () => {
    const view = viewOf(pantinNodeId("press"), { ...opened, inspectorOpen: false });
    expect([view.open, view.groups]).toEqual([false, []]);
  });
});
