import {
  type CreateJointRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { addJointToDocument, updateJointInDocument } from "./joint-rules.ts";

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "main",
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
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Test",
  assemblies: [
    { key: "main", name: "main", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
  ],
  bodies: ["a", "b", "c"].map(body),
  joints: [],
  drives: [],
  actuators: [],
  sensors: [],
};

function link(parent: string, child: string, name = "Link"): CreateJointRequest {
  return { type: "fixed", name, parent, child, origin: [0, 0, 0], axis: [0, 0, 1] };
}

function withLinks(...links: [string, string][]): PantinDocument {
  return links.reduce(
    (document, [parent, child]) =>
      addJointToDocument(document, link(parent, child), NO_POSITIONS).document,
    EMPTY,
  );
}

describe("addJointToDocument", () => {
  it("adds the joint with an id derived from its name, unique", () => {
    const first = addJointToDocument(EMPTY, link("a", "b", "Axe X"), NO_POSITIONS);
    expect(first.joint.id).toBe("axe-x");
    const second = addJointToDocument(first.document, link("a", "c", "Axe X"), NO_POSITIONS);
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
    expect(() => addJointToDocument(document, request, NO_POSITIONS)).toThrow(message);
  });

  it("does not modify the input document", () => {
    const before = structuredClone(EMPTY);
    addJointToDocument(EMPTY, link("a", "b"), NO_POSITIONS);
    expect(EMPTY).toEqual(before);
  });
});

describe("updateJointInDocument", () => {
  // a -> b (id "link"), b -> c (id "link-2")
  const chain = withLinks(["a", "b"], ["b", "c"]);

  it("changes every field but the id, and keeps the joint's place", () => {
    const moved = { ...link("a", "b", "Renamed"), origin: [0.1, 0, 0] as [number, number, number] };
    const { document, joint } = updateJointInDocument(chain, "link", moved, NO_POSITIONS);
    expect(joint).toEqual({ id: "link", tagKey: "link", ...moved });
    expect(document.joints.map((candidate) => candidate.id)).toEqual(["link", "link-2"]);
  });

  it("changes the type, keeping the id and the place in the list (ADR 0018)", () => {
    const slider: CreateJointRequest = { ...link("a", "b"), type: "prismatic", limits: [0, 0.1] };
    const { document, joint } = updateJointInDocument(chain, "link", slider, NO_POSITIONS);
    expect(joint).toEqual({ id: "link", tagKey: "link", ...slider });
    expect(document.joints.map((candidate) => candidate.id)).toEqual(["link", "link-2"]);
  });

  it("lets a joint keep its own child without counting it as a second parent", () => {
    expect(() => updateJointInDocument(chain, "link", link("a", "b"), NO_POSITIONS)).not.toThrow();
  });

  it.each<[string, string, CreateJointRequest, RegExp]>([
    ["an unknown joint", "ghost", link("a", "b"), /no joint "ghost"/],
    ["a cycle", "link", link("c", "b"), /would make a cycle/],
    ["a child that already has a parent", "link", link("a", "c"), /already has the parent joint/],
  ])("refuses %s", (_label, jointId, request, message) => {
    expect(() => updateJointInDocument(chain, jointId, request, NO_POSITIONS)).toThrow(message);
  });

  it("does not modify the document it is given", () => {
    const before = structuredClone(chain);
    updateJointInDocument(chain, "link", link("a", "b", "Renamed"), NO_POSITIONS);
    expect(chain).toEqual(before);
  });
});

describe("updateJointInDocument with sensors", () => {
  it("refuses new limits that a switch on the joint cannot hold, naming it (ADR 0026)", () => {
    const slider: CreateJointRequest = { ...link("a", "b"), type: "prismatic", limits: [0, 0.1] };
    const withSlider = updateJointInDocument(
      withLinks(["a", "b"]),
      "link",
      slider,
      NO_POSITIONS,
    ).document;
    const extended: PantinDocument = {
      ...withSlider,
      sensors: [
        {
          id: "extended",
          tagKey: "extended",
          name: "Extended",
          assembly: "main",
          joint: "link",
          type: "limit_switch",
          operatingPosition: 0.098,
          differentialTravel: 0.0005,
          overtravel: 0.002,
          normallyClosed: false,
        },
      ],
    };
    const longer: CreateJointRequest = { ...slider, limits: [0, 0.2] };
    expect(() => updateJointInDocument(extended, "link", longer, NO_POSITIONS)).toThrow(
      /Sensor "extended" on joint "link": The stroke goes past the overtravel/,
    );
  });
});
