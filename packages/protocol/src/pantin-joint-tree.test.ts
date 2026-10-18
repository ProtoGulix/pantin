import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";
import { type JointTreeIssueKind, jointTreeIssues } from "./pantin-joint-tree.ts";

// Where joints may go and what they may form (ADR 0055 points 3 and 4).

const IDENTITY = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const body = (id: string) => `body:${id}`;

function bodyOf(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "a.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

type End = { kind: "body"; id: string } | { kind: "assembly"; key: string };

// "body:a0" or "group:b" as a joint end.
function end(text: string): End {
  const [kind = "", name = ""] = text.split(":");
  return kind === "group" ? { kind: "assembly", key: name } : { kind: "body", id: name };
}

function fixed(id: string, parent: string, child: string) {
  return {
    id,
    tagKey: id,
    name: id,
    type: "fixed",
    parent: end(parent),
    child: end(child),
    origin: [0, 0, 0],
    axis: [0, 0, 1],
  };
}

function documentOf(joints: unknown[]) {
  return {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: ["a", "b", "c"].map((key) => ({ key, name: key, placement: IDENTITY })),
    bodies: [
      bodyOf("a0", "a"),
      bodyOf("a1", "a"),
      bodyOf("b0", "b"),
      bodyOf("b1", "b"),
      bodyOf("c0", "c"),
    ],
    joints,
    drives: [],
    actuators: [],
    sensors: [],
    belts: [],
    guides: [],
    emitters: [],
    absorbers: [],
    presenceSensors: [],
  };
}

function messagesOf(joints: unknown[]): string[] {
  const parsed = PantinDocumentSchema.safeParse(documentOf(joints));
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

function kindsOf(joints: unknown[]): JointTreeIssueKind[] {
  const parsed = documentOf(joints);
  return jointTreeIssues({
    assemblies: parsed.assemblies,
    bodies: parsed.bodies,
    // The joints come from this file's `fixed()`, whatever the parameter type says.
    joints: joints.map((item) => item as ReturnType<typeof fixed>),
  }).map((issue) => issue.kind);
}

describe("joints between assemblies and inside one", () => {
  it("accepts a group as the child, a body as the parent, and a ring turning in its bearing", () => {
    const joints = [
      fixed("a-to-b", body("a1"), "group:b"),
      // The child is a body of b and its parent is the group itself.
      fixed("ring", "group:b", body("b1")),
      fixed("a-inside", body("a0"), body("a1")),
      fixed("group-to-group", "group:b", "group:c"),
    ];
    expect(messagesOf(joints)).toEqual([]);
  });

  it("refuses a body as the child of a joint between assemblies, proposing its group", () => {
    const messages = messagesOf([fixed("across", body("a0"), body("b0"))]);
    expect(messages).toEqual([
      expect.stringMatching(/Joint "across".*must be a group: use group "b" as the child/),
    ]);
    expect(kindsOf([fixed("across", body("a0"), body("b0"))])).toEqual([
      "body_child_between_assemblies",
    ]);
  });

  it("refuses a body of another assembly as the child of a group's own joint", () => {
    const messages = messagesOf([fixed("ring-out", "group:a", body("b0"))]);
    expect(messages).toEqual([expect.stringContaining('use group "b" as the child')]);
  });

  it("refuses a group hung from itself or from one of its bodies, naming the joint", () => {
    expect(messagesOf([fixed("self", "group:b", "group:b")])).toEqual([
      expect.stringMatching(/Joint "self" cannot link group "b" to itself/),
    ]);
    const inside = [fixed("inside", body("b0"), "group:b")];
    expect(messagesOf(inside)).toEqual([
      expect.stringMatching(/Joint "inside" makes group "b".*part of that group/),
    ]);
    expect(kindsOf(inside)).toEqual(["group_in_itself"]);
  });
});

describe("parents and cycles", () => {
  it("refuses a body with two parent joints, naming both", () => {
    const joints = [fixed("first", body("a0"), body("a1")), fixed("second", "group:a", body("a1"))];
    expect(messagesOf(joints)).toEqual([
      expect.stringMatching(/Body "a1" already has the parent joint "first".*"second"/),
    ]);
  });

  it("refuses a group with two parent joints, as an assembly anchored twice", () => {
    const joints = [fixed("first", body("a0"), "group:b"), fixed("second", body("c0"), "group:b")];
    expect(messagesOf(joints)).toEqual([
      'Assembly "b" is anchored twice: by joint "first" and joint "second".',
    ]);
  });

  it("refuses a cycle of bodies", () => {
    const joints = [fixed("go", body("a0"), body("a1")), fixed("back", body("a1"), body("a0"))];
    expect(messagesOf(joints)).toEqual([expect.stringMatching(/form a cycle through body/)]);
  });

  it("refuses a cycle through groups, as a loop of anchors naming the joints", () => {
    // b hangs from a body of a, and a hangs from a body of b.
    const joints = [fixed("a-b", body("a0"), "group:b"), fixed("b-a", body("b1"), "group:a")];
    expect(messagesOf(joints)).toEqual([expect.stringMatching(/loop of anchors.*"a-b".*"b-a"/)]);
  });

  it("refuses an end that does not exist", () => {
    expect(messagesOf([fixed("lost", body("zz"), body("a1"))])).toEqual([
      expect.stringContaining('unknown body "zz"'),
    ]);
    expect(messagesOf([fixed("lost", body("a0"), "group:zz")])).toEqual([
      expect.stringContaining('unknown group "zz"'),
    ]);
  });

  it("reads an end by its kind only: a bare id is not an end", () => {
    const bare = { ...fixed("bare", body("a0"), body("a1")), parent: "a0" };
    expect(messagesOf([bare]).length).toBeGreaterThan(0);
  });
});
