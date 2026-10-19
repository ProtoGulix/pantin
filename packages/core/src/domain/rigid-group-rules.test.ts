import { bodyEndpoint, type CreateJointRequest, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { expectConflict } from "../test-support/expect-conflict.ts";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import { ABOUT_X, assembly, body, documentOf, joint } from "../test-support/placed-fixtures.ts";
import { deleteAssemblyWithContents } from "./assembly-deletion.ts";
import { renameAssemblyKey } from "./assembly-edits.ts";
import { addJointToDocument, updateJointInDocument } from "./joint-rules.ts";

// Where a joint may go and what the edits do to a group end (ADR 0055
// points 3, 4 and 11): the refusals name the joint.

const ASSEMBLIES = [assembly("a", ABOUT_X), assembly("b", ABOUT_X), assembly("c", ABOUT_X)];
const BODIES = [
  body("a0", "a"),
  body("a1", "a"),
  body("b0", "b"),
  body("b1", "b"),
  body("c0", "c"),
];
const EMPTY = documentOf([], BODIES, ASSEMBLIES);

function request(
  name: string,
  parent: CreateJointRequest["parent"],
  child: CreateJointRequest["child"],
): CreateJointRequest {
  return { type: "fixed", name, parent, child, origin: [0, 0, 0], axis: [0, 0, 1] };
}

const add = (document: typeof EMPTY, joint: CreateJointRequest) =>
  addJointToDocument(document, joint, NO_POSITIONS).document;

describe("a joint between assemblies", () => {
  it("takes a group as its child", () => {
    const { joint: stored } = addJointToDocument(
      EMPTY,
      request("Mount", bodyEndpoint("a1"), groupEndpoint("b")),
      NO_POSITIONS,
    );
    expect(stored).toMatchObject({ id: "mount", child: { kind: "assembly", key: "b" } });
  });

  it("refuses a body as its child, proposing the group of that body", () => {
    expectConflict(
      () => add(EMPTY, request("Mount", bodyEndpoint("a1"), bodyEndpoint("b0"))),
      'Joint "mount"',
      'body "b0"',
      'use group "b" as the child',
    );
  });

  it("refuses to change a joint so that its child becomes a body of another assembly", () => {
    const mounted = add(EMPTY, request("Mount", bodyEndpoint("a1"), groupEndpoint("b")));
    expectConflict(
      () =>
        updateJointInDocument(
          mounted,
          "mount",
          request("Mount", bodyEndpoint("a1"), bodyEndpoint("b0")),
          NO_POSITIONS,
        ),
      'Joint "mount"',
      'use group "b"',
    );
  });
});

describe("a joint inside one assembly", () => {
  it("takes a body whose parent is a body of it or the group itself", () => {
    const withBody = add(EMPTY, request("Inside", bodyEndpoint("a0"), bodyEndpoint("a1")));
    const withRing = add(EMPTY, request("Ring", groupEndpoint("a"), bodyEndpoint("a1")));
    expect(withBody.joints).toHaveLength(1);
    expect(withRing.joints).toHaveLength(1);
  });

  it("refuses a group child hung from the group itself or from one of its bodies", () => {
    expectConflict(
      () => add(EMPTY, request("Loop", bodyEndpoint("b0"), groupEndpoint("b"))),
      'Joint "loop"',
      'group "b"',
      "part of that group",
    );
    expect(() => add(EMPTY, request("Self", groupEndpoint("b"), groupEndpoint("b")))).toThrow(
      /Joint "self" cannot link group "b" to itself/,
    );
  });
});

describe("one parent joint per body and per group", () => {
  it("refuses a second parent for a body, naming the first joint", () => {
    const first = add(EMPTY, request("First", bodyEndpoint("a0"), bodyEndpoint("a1")));
    expect(() => add(first, request("Second", groupEndpoint("a"), bodyEndpoint("a1")))).toThrow(
      /already has the parent joint "first"/,
    );
  });

  it("refuses a second parent for a group, naming the joint that anchors it", () => {
    const first = add(EMPTY, request("First", bodyEndpoint("a0"), groupEndpoint("b")));
    expectConflict(
      () => add(first, request("Second", bodyEndpoint("c0"), groupEndpoint("b"))),
      'Assembly "b" is already anchored by joint "first"',
    );
  });
});

describe("no cycle in the links", () => {
  it("refuses a body hung from what it moves, through groups", () => {
    const first = add(EMPTY, request("Down", bodyEndpoint("a0"), groupEndpoint("b")));
    expectConflict(
      () => add(first, request("Up", bodyEndpoint("b0"), groupEndpoint("a"))),
      "loop",
      'joint "down"',
    );
  });

  it("refuses a cycle of bodies", () => {
    const first = add(EMPTY, request("Go", bodyEndpoint("a0"), bodyEndpoint("a1")));
    const refusal = (): unknown =>
      add(first, request("Back", bodyEndpoint("a1"), bodyEndpoint("a0")));
    expect(refusal).toThrow(ApiError);
    expect(refusal).toThrow(/cycle through body/);
  });
});

describe("edits that name a group", () => {
  const mounted = documentOf(
    [
      joint({
        id: "mount",
        type: "fixed",
        parent: bodyEndpoint("a1"),
        child: groupEndpoint("b"),
      }),
    ],
    BODIES,
    ASSEMBLIES,
  );

  it("rewrite the key of the group in the ends that use it", () => {
    const renamed = renameAssemblyKey(mounted, "b", "bearing");
    expect(renamed.joints.map((item) => item.child)).toEqual([groupEndpoint("bearing")]);
    expect(renamed.bodies.filter((item) => item.assembly === "bearing")).toHaveLength(2);
  });

  it("delete the joints of a deleted group with it, whichever end it is", () => {
    const { document } = deleteAssemblyWithContents(mounted, "b", NO_POSITIONS);
    expect(document.joints).toEqual([]);
    const fromGroup = documentOf(
      [joint({ id: "out", type: "fixed", parent: groupEndpoint("b"), child: bodyEndpoint("b1") })],
      BODIES,
      ASSEMBLIES,
    );
    expect(deleteAssemblyWithContents(fromGroup, "b", NO_POSITIONS).document.joints).toEqual([]);
  });
});
