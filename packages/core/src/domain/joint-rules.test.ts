import type { CreateJointRequest, PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { addJointToDocument } from "./joint-rules.ts";

function body(id: string) {
  return {
    id,
    name: id,
    source: {
      fileName: `${id}.stl`,
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

const EMPTY: PantinDocument = {
  schema_version: 2,
  name: "Test",
  bodies: ["a", "b", "c"].map(body),
  joints: [],
};

function link(parent: string, child: string, name = "Link"): CreateJointRequest {
  return { type: "fixed", name, parent, child, origin: [0, 0, 0], axis: [0, 0, 1] };
}

function withLinks(...links: [string, string][]): PantinDocument {
  return links.reduce(
    (document, [parent, child]) => addJointToDocument(document, link(parent, child)).document,
    EMPTY,
  );
}

describe("addJointToDocument", () => {
  it("adds the joint with an id derived from its name, unique", () => {
    const first = addJointToDocument(EMPTY, link("a", "b", "Axe X"));
    expect(first.joint.id).toBe("axe-x");
    const second = addJointToDocument(first.document, link("a", "c", "Axe X"));
    expect(second.joint.id).toBe("axe-x-2");
    expect(second.document.joints.map((joint) => joint.id)).toEqual(["axe-x", "axe-x-2"]);
  });

  it.each<[string, PantinDocument, CreateJointRequest, RegExp]>([
    ["an unknown parent", EMPTY, link("zz", "b"), /parent body "zz" does not exist/],
    ["an unknown child", EMPTY, link("a", "zz"), /child body "zz" does not exist/],
    ["a self link", EMPTY, link("a", "a"), /cannot link body "a" to itself/],
    [
      "a second parent",
      withLinks(["a", "b"]),
      link("c", "b"),
      /already has the parent joint "link"/,
    ],
    ["a direct cycle", withLinks(["a", "b"]), link("b", "a"), /would make a cycle/],
    ["a longer cycle", withLinks(["a", "b"], ["b", "c"]), link("c", "a"), /would make a cycle/],
  ])("refuses %s", (_case, document, request, message) => {
    expect(() => addJointToDocument(document, request)).toThrow(message);
  });

  it("does not modify the input document", () => {
    const before = structuredClone(EMPTY);
    addJointToDocument(EMPTY, link("a", "b"));
    expect(EMPTY).toEqual(before);
  });
});
