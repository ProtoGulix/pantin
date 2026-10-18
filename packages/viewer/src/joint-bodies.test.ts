import { bodyEndpoint, groupEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, jointOf } from "./diagram/diagram-fixtures.ts";
import { endpointBodyId, groupRepresentatives, jointBodyIds } from "./joint-bodies.ts";

// A group is drawn through its root body (ADR 0055): the first body of the
// assembly that no joint moves.

const DOCUMENT = documentOf({
  assemblies: ["a", "tool"],
  bodies: [bodyOf("star", "tool"), bodyOf("handle", "tool"), bodyOf("alone", "a")],
  joints: [
    // "star" is moved from inside the group, so "handle" is its root body.
    { ...jointOf("inside", "star", "fixed"), parent: bodyEndpoint("handle") },
    { ...jointOf("hang", "x", "fixed"), child: groupEndpoint("tool") },
  ],
});

describe("groupRepresentatives", () => {
  it("picks the first body of each assembly that no joint moves, in document order", () => {
    const representatives = groupRepresentatives(DOCUMENT);
    expect(representatives.get("tool")).toBe("handle");
    expect(representatives.get("a")).toBe("frame");
  });

  it("has no stand-in when every body is moved, nor for an empty group", () => {
    const moved = documentOf({
      assemblies: ["a", "b", "empty"],
      bodies: [bodyOf("one", "b"), bodyOf("two", "b")],
      joints: [
        // A ring turning in the group, and a second body hung from the ring.
        { ...jointOf("m1", "one", "fixed"), parent: groupEndpoint("b") },
        { ...jointOf("m2", "two", "fixed"), parent: bodyEndpoint("one") },
      ],
    });
    const representatives = groupRepresentatives(moved);
    // "one" and "two" move inside the group: neither may stand for its frame.
    expect(representatives.has("b")).toBe(false);
    expect(representatives.has("empty")).toBe(false);
  });
});

describe("endpointBodyId and jointBodyIds", () => {
  const representatives = groupRepresentatives(DOCUMENT);

  it("keeps a body and stands a group for its root body", () => {
    expect(endpointBodyId(representatives, bodyEndpoint("alone"))).toBe("alone");
    expect(endpointBodyId(representatives, groupEndpoint("tool"))).toBe("handle");
    expect(endpointBodyId(representatives, groupEndpoint("nowhere"))).toBe("");
  });

  it("reads both ends of a joint", () => {
    const joint = { parent: bodyEndpoint("alone"), child: groupEndpoint("tool") };
    expect(jointBodyIds(representatives, joint)).toEqual({ parent: "alone", child: "handle" });
  });
});
