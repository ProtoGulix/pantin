import { bodyEndpoint, groupEndpoint, type Joint, type PantinDocument } from "@pantin/protocol";
import { describe, it } from "vitest";
import { expectConflict } from "../test-support/expect-conflict.ts";
import { dissolvingDocument } from "../test-support/group-fixtures.ts";
import { body, joint } from "../test-support/placed-fixtures.ts";
import { ungroup } from "./ungroup.ts";

// Dégrouper (ADR 0055 point 7): refused whenever a pose would change, and the
// message names the joint that moves the group.

function replacingHold(fields: Partial<Joint>): PantinDocument {
  const hold = joint({
    id: "hold",
    type: "fixed",
    parent: bodyEndpoint("h"),
    child: groupEndpoint("g"),
    ...fields,
  });
  const document = dissolvingDocument();
  return { ...document, joints: document.joints.map((item) => (item.id === "hold" ? hold : item)) };
}

describe("ungroup, groups that cannot be dissolved", () => {
  it("refuses a top-level group", () => {
    expectConflict(
      () => ungroup(dissolvingDocument(), "m"),
      'Assembly "m"',
      "top of the structure",
    );
  });

  it("refuses a group that a moving joint moves", () => {
    expectConflict(
      () => ungroup(replacingHold({ type: "prismatic", limits: [0, 1] }), "g"),
      'Group "g"',
      'joint "hold"',
      "prismatic",
    );
  });

  it("refuses a group held to another assembly than its parent", () => {
    expectConflict(
      () => ungroup(replacingHold({ parent: bodyEndpoint("x1") }), "g"),
      'joint "hold"',
      'assembly "x"',
    );
  });

  it("refuses a group nothing moves inside an assembly that something moves", () => {
    const document = dissolvingDocument();
    const free = {
      ...document,
      joints: [
        ...document.joints.filter(({ id }) => id !== "hold"),
        joint({
          id: "carry-m",
          type: "fixed",
          parent: bodyEndpoint("x1"),
          child: groupEndpoint("m"),
        }),
      ],
    };
    expectConflict(() => ungroup(free, "g"), 'joint "carry-m"', 'assembly "m"');
  });
});

describe("ungroup, a holding joint that follows something moving", () => {
  it("refuses a group held by a body that moves inside the parent", () => {
    const document = dissolvingDocument();
    const moving = {
      ...document,
      bodies: [...document.bodies, body("p", "m")],
      joints: [
        ...document.joints.map((item) =>
          item.id === "hold" ? { ...item, parent: bodyEndpoint("p") } : item,
        ),
        joint({
          id: "move-p",
          type: "prismatic",
          parent: bodyEndpoint("h"),
          child: bodyEndpoint("p"),
        }),
      ],
    };
    expectConflict(() => ungroup(moving, "g"), 'joint "hold"', 'body "p"');
  });
});

describe("ungroup, what others rely on", () => {
  it("refuses to delete a holding joint that a sensor watches", () => {
    const document = {
      ...dissolvingDocument(),
      sensors: [
        {
          id: "watch",
          tagKey: "watch",
          name: "Watch",
          assembly: "m",
          joint: "hold",
          type: "position_switch" as const,
          range: [0, 1] as [number, number],
          normallyClosed: false,
        },
      ],
    };
    expectConflict(() => ungroup(document, "g"), 'Joint "hold"', 'sensor "watch"');
  });

  it("refuses a tag key already used in the parent, with a free alternative", () => {
    const document = dissolvingDocument();
    const clashing = {
      ...document,
      bodies: [...document.bodies, body("pm", "m")],
      joints: [
        ...document.joints,
        joint({
          id: "other-ring",
          tagKey: "ring",
          parent: groupEndpoint("m"),
          child: bodyEndpoint("pm"),
        }),
      ],
    };
    expectConflict(
      () => ungroup(clashing, "g"),
      'Tag key "ring"',
      'joint "ring"',
      'joint "other-ring"',
      '"ring-2" is free',
    );
  });
});
