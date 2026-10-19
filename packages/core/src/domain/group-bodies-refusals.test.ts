import { bodyEndpoint, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { expectConflict } from "../test-support/expect-conflict.ts";
import { groupingDocument } from "../test-support/group-fixtures.ts";
import { joint } from "../test-support/placed-fixtures.ts";
import { groupBodies } from "./group-bodies.ts";

// Grouper (ADR 0055 point 6): every refusal names what is in the way, and
// nothing changes (the functions are pure, the input is never edited).

const GROUP = { name: "G", bodies: ["a", "b"], assemblies: [] as string[] };

function withJoints(...extra: ReturnType<typeof joint>[]): PantinDocument {
  const document = groupingDocument();
  return { ...document, joints: [...document.joints, ...extra] };
}

function attempt(document: PantinDocument, request = GROUP): ApiError {
  try {
    groupBodies(document, "m", request);
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a refusal.");
}

describe("groupBodies, joints in the way", () => {
  it("refuses a member that hangs from a non-member that moves", () => {
    const document = withJoints(
      joint({
        id: "move-c",
        type: "prismatic",
        parent: bodyEndpoint("h"),
        child: bodyEndpoint("c"),
      }),
    );
    const moving = {
      ...document,
      joints: document.joints.map((item) =>
        item.id === "sb" ? { ...item, parent: bodyEndpoint("c") } : item,
      ),
    };
    expectConflict(() => groupBodies(moving, "m", GROUP), 'Joint "sb"', 'body "c"', "Add");
  });

  it("refuses a joint from a member to a body that is not in the group", () => {
    const document = withJoints(
      joint({ id: "to-c", parent: bodyEndpoint("a"), child: bodyEndpoint("c") }),
    );
    expectConflict(() => groupBodies(document, "m", GROUP), 'Joint "to-c"', 'body "c"', "Add body");
  });
});

describe("groupBodies, joints that others rely on", () => {
  it("refuses to delete a fixed joint that a sensor watches", () => {
    const document = {
      ...groupingDocument(),
      sensors: [
        {
          id: "watch",
          tagKey: "watch",
          name: "Watch",
          assembly: "m",
          joint: "fa",
          type: "position_switch" as const,
          range: [0, 1] as [number, number],
          normallyClosed: false,
        },
      ],
    };
    expectConflict(() => groupBodies(document, "m", GROUP), 'Joint "fa"', 'sensor "watch"');
  });
});

describe("groupBodies, members that cannot be grouped", () => {
  it("answers not_found for an unknown assembly, body or sub-assembly", () => {
    const document = groupingDocument();
    expect(() => groupBodies(document, "nope", GROUP)).toThrow(/no assembly "nope"/);
    expect(attempt(document, { ...GROUP, bodies: ["ghost"] }).code).toBe("not_found");
    expect(attempt(document, { ...GROUP, assemblies: ["ghost"] }).code).toBe("not_found");
  });

  it("refuses a body of another assembly", () => {
    expectConflict(
      () => groupBodies(groupingDocument(), "m", { ...GROUP, bodies: ["x1"] }),
      'Body "x1"',
      'assembly "x"',
    );
  });

  it("refuses an assembly that is not a direct sub-assembly", () => {
    expectConflict(
      () => groupBodies(groupingDocument(), "m", { ...GROUP, assemblies: ["x"] }),
      'Assembly "x"',
      "direct sub-assembly",
    );
  });

  it("refuses a member listed twice", () => {
    const error = attempt(groupingDocument(), { ...GROUP, bodies: ["a", "a"] });
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain('"a" is listed twice');
  });
});
