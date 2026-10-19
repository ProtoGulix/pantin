import { bodyEndpoint, groupEndpoint, type JointEndpoint } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  joint,
} from "../test-support/placed-fixtures.ts";
import { deleteAssemblyWithContents } from "./assembly-deletion.ts";

const slideJoint = (id: string, parent: JointEndpoint, child: JointEndpoint) =>
  joint({ id, type: "prismatic", parent, child, axis: [1, 0, 0], limits: [0, 1] });
const fixedJoint = (id: string, parent: JointEndpoint, child: JointEndpoint) =>
  joint({ id, type: "fixed", parent, child });

describe("joints on groups (ADR 0055 point 11)", () => {
  // "main" holds the sub-group "chape" (structure), which holds "tail"; the group
  // "other" hangs from "tail" and a slider moves "chape" from the frame.
  const GROUP_TREE = documentOf(
    [
      slideJoint("lift", bodyEndpoint("frame"), groupEndpoint("chape")),
      fixedJoint("tail-hold", groupEndpoint("chape"), groupEndpoint("tail")),
      fixedJoint("other-hold", groupEndpoint("tail"), groupEndpoint("other")),
    ],
    [body("frame", "main"), body("pin", "tail"), body("o", "other")],
    [
      assembly("main", ABOUT_Z),
      { ...assembly("chape", ABOUT_X), parent: "main" },
      { ...assembly("tail", ABOUT_DIAGONAL), parent: "chape" },
      assembly("other", ABOUT_DIAGONAL),
    ],
  );

  it("lists the joints on the group and its sub-groups in the dry run, then deletes them", () => {
    const { document, deletion } = deleteAssemblyWithContents(GROUP_TREE, "chape", NO_POSITIONS);
    expect(deletion.joints.map(({ id }) => id)).toEqual(["lift", "tail-hold", "other-hold"]);
    expect(deletion.joints.map(({ betweenAssemblies }) => betweenAssemblies)).toEqual([
      true,
      true,
      true,
    ]);
    expect(document.joints).toEqual([]);
    expect(document.assemblies.map(({ key }) => key)).toEqual(["main", "other"]);
  });

  it("leaves no joint on a group that is gone", () => {
    const { document } = deleteAssemblyWithContents(GROUP_TREE, "other", NO_POSITIONS);
    expect(document.joints.map(({ id }) => id)).toEqual(["lift", "tail-hold"]);
  });
});
