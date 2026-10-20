import { describe, expect, it } from "vitest";
import { contextEntries } from "./context-menu-model.ts";

// Which actions each kind of tree node offers (offers that depend on the
// state, like grouping, are filtered later: see controller/grouping-actions.test.ts).

describe("context menu", () => {
  it("offers import and a new assembly only on a Pantin, rename only when possible", () => {
    const pantinId = "press";
    expect(contextEntries({ kind: "pantin", pantinId }, true)).toEqual([
      "rename",
      "frame",
      "importInto",
      "newAssembly",
      "deleteRedundantJoints",
    ]);
    expect(contextEntries({ kind: "body", pantinId, bodyId: "rail" }, true)).toEqual([
      "rename",
      "frame",
      "group",
      "delete",
    ]);
    expect(
      contextEntries({ kind: "sourceNode", pantinId, bodyId: "rail", index: 0 }, false),
    ).toEqual(["frame"]);
  });
});

describe("context menu entries of assemblies and joints", () => {
  it("offers a new joint on the folder and grouping on bodies and assemblies", () => {
    const pantinId = "press";
    expect(
      contextEntries({ kind: "folder", pantinId, folder: "betweenAssemblies" }, false),
    ).toEqual(["frame", "newJoint"]);
    expect(contextEntries({ kind: "assembly", pantinId, key: "main" }, true)).toEqual([
      "rename",
      "frame",
      "newJoint",
      "group",
      "ungroup",
      "toggleAssemblyHidden",
      "toggleAssemblyIsolated",
      "delete",
    ]);
  });

  it("offers a type change, wiring and deletion on a joint", () => {
    const pantinId = "press";
    expect(
      contextEntries(
        { kind: "joint", pantinId, jointId: "hinge", underBodyId: null, underGroupKey: null },
        false,
      ),
    ).toEqual([
      "frame",
      "changeJointType",
      "actuateJoint",
      "addJointSensor",
      "addEndSwitches",
      "delete",
    ]);
  });
});
