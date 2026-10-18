import { describe, expect, it } from "vitest";
import { bodyOf, documentOf } from "../diagram/diagram-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { groupingTargetOf, ungroupTargetOf } from "./grouping-model.ts";

const base = documentOf({
  assemblies: ["frame", "cap", "other"],
  bodies: [bodyOf("rod", "frame"), bodyOf("head", "frame"), bodyOf("lid", "other")],
});
const document = {
  ...base,
  assemblies: base.assemblies.map((assembly) =>
    assembly.key === "cap" ? { ...assembly, parent: "frame" } : assembly,
  ),
};
const body = (id: string) => bodyNodeId("p", id);
const assembly = (key: string) => assemblyNodeId("p", key);

describe("groupingTargetOf", () => {
  it("groups bodies and sub-assemblies of one assembly", () => {
    expect(groupingTargetOf(document, "p", [body("rod"), body("head"), assembly("cap")])).toEqual({
      pantinId: "p",
      assemblyKey: "frame",
      bodies: ["rod", "head"],
      assemblies: ["cap"],
    });
  });

  it("accepts a single body or sub-assembly", () => {
    expect(groupingTargetOf(document, "p", [body("rod")])?.assemblyKey).toBe("frame");
    expect(groupingTargetOf(document, "p", [assembly("cap")])?.assemblies).toEqual(["cap"]);
  });

  it("refuses other assemblies, top-level groups, other rows and no rows", () => {
    expect(groupingTargetOf(document, "p", [body("rod"), body("lid")])).toBeNull();
    expect(groupingTargetOf(document, "p", [assembly("frame")])).toBeNull();
    expect(groupingTargetOf(document, "p", [pantinNodeId("p")])).toBeNull();
    expect(groupingTargetOf(document, "p", [body("ghost")])).toBeNull();
    expect(groupingTargetOf(document, "q", [body("rod")])).toBeNull();
    expect(groupingTargetOf(document, "p", [])).toBeNull();
  });
});

describe("ungroupTargetOf", () => {
  it("is offered on an assembly that has a structure parent only", () => {
    expect(ungroupTargetOf(document, "p", assembly("cap"))).toEqual({
      pantinId: "p",
      key: "cap",
      name: "CAP",
    });
    expect(ungroupTargetOf(document, "p", assembly("frame"))).toBeNull();
    expect(ungroupTargetOf(document, "p", body("rod"))).toBeNull();
    expect(ungroupTargetOf(document, "p", null)).toBeNull();
  });
});
