import type { PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  ABOUT_Z,
  assembly,
  body,
  documentOf,
  expectSamePoses,
  joint,
} from "../test-support/placed-fixtures.ts";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { deleteAssemblyWithContents } from "./assembly-deletion.ts";
import {
  createAssembly,
  deleteAssembly,
  renameAssemblyKey,
  setAssemblyParent,
} from "./assembly-edits.ts";

// ADR 0040 points 7 and 8: the structure tree. "main" contains "chape", which
// contains "tail"; "other" is a separate top level assembly.

const TREE = [
  assembly("main", ABOUT_Z),
  { ...assembly("chape", ABOUT_X), parent: "main" },
  { ...assembly("tail", ABOUT_DIAGONAL), parent: "chape" },
  assembly("other", ABOUT_DIAGONAL),
];
const BODIES = [
  body("frame", "main"),
  body("carriage", "main", ABOUT_X),
  body("clevis", "chape", ABOUT_Z),
  body("pin", "tail"),
  body("o", "other", ABOUT_X),
];
const JOINTS = [
  joint({ id: "slide", type: "fixed", parent: "frame", child: "carriage" }),
  joint({ id: "mount", type: "fixed", parent: "carriage", child: "clevis" }),
  joint({ id: "hinge", parent: "clevis", child: "pin" }),
];
const tree = (extra = JOINTS): PantinDocument => documentOf(extra, BODIES, TREE);

function refusal(action: () => unknown): ApiError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected a refusal.");
}

describe("setAssemblyParent", () => {
  it("moves an assembly in the structure tree and changes nothing else", () => {
    const before = tree();
    const after = setAssemblyParent(before, "tail", "other");
    expect(after.assemblies.find(({ key }) => key === "tail")?.parent).toBe("other");
    expect({ ...after, assemblies: [] }).toEqual({ ...before, assemblies: [] });
    expect(after.assemblies.find(({ key }) => key === "tail")?.placement).toBe(ABOUT_DIAGONAL);
    expect(deriveAssemblyAnchors(after)).toEqual(deriveAssemblyAnchors(before));
  });

  it("makes an assembly top level with null", () => {
    const after = setAssemblyParent(tree(), "chape", null);
    expect("parent" in (after.assemblies.find(({ key }) => key === "chape") ?? {})).toBe(false);
  });

  it.each([
    ["main", "main"],
    ["main", "tail"],
  ])("refuses a loop moving %s into %s, naming the assembly", (key, parent) => {
    const error = refusal(() => setAssemblyParent(tree(), key, parent));
    expect(error.code).toBe("conflict");
    expect(error.message).toContain('Assembly "main" would contain itself');
  });

  it("refuses an unknown parent with not_found", () => {
    expect(refusal(() => setAssemblyParent(tree(), "tail", "ghost")).code).toBe("not_found");
  });
});

describe("createAssembly with a parent", () => {
  it("stores the parent and refuses an unknown one", () => {
    const { assembly: created } = createAssembly(tree(), "Spare", "tail");
    expect(created.parent).toBe("tail");
    expect(refusal(() => createAssembly(tree(), "Spare", "ghost")).code).toBe("not_found");
  });
});

describe("renameAssemblyKey with children", () => {
  it("rewrites the parent of the child assemblies, which stay valid", () => {
    const after = renameAssemblyKey(tree(), "chape", "yoke");
    const parents = Object.fromEntries(after.assemblies.map(({ key, parent }) => [key, parent]));
    expect(parents).toMatchObject({ yoke: "main", tail: "yoke" });
  });
});

describe("plain deletion of an assembly with sub-assemblies", () => {
  it("is refused and the message mentions the sub-assemblies", () => {
    const emptied = documentOf([], [body("o", "other")], TREE);
    const error = refusal(() => deleteAssembly(emptied, "main"));
    expect(error.code).toBe("conflict");
    expect(error.message).toContain("sub-assemblies");
    expect(error.message).toContain('"chape"');
  });
});

describe("deletion with contents of a subtree (ADR 0040 point 8)", () => {
  it("removes the descendants, their contents and the joints between them", () => {
    const { document, deletion } = deleteAssemblyWithContents(tree(), "chape", NO_POSITIONS);
    expect(document.assemblies.map(({ key }) => key)).toEqual(["main", "other"]);
    expect(document.bodies.map(({ id }) => id)).toEqual(["frame", "carriage", "o"]);
    expect(document.joints.map(({ id }) => id)).toEqual(["slide"]);
    expect(deletion.descendantAssemblies).toEqual([{ key: "tail", name: "tail" }]);
    expect(deletion.bodies.map(({ id }) => id)).toEqual(["clevis", "pin"]);
    const hinge = deletion.joints.find(({ id }) => id === "hinge");
    expect(hinge?.betweenAssemblies).toBe(true);
  });

  it("re-anchors an outside assembly anchored to a descendant, keeping its pose", () => {
    const ext = joint({ id: "ext", type: "fixed", parent: "pin", child: "o" });
    const before = tree([...JOINTS, ext]);
    const { document, deletion } = deleteAssemblyWithContents(before, "chape", NO_POSITIONS);
    expect(deletion.reanchoredAssemblies).toEqual([{ key: "other", name: "other" }]);
    expect(deriveAssemblyAnchors(document).has("other")).toBe(false);
    expectSamePoses(document, before, NO_POSITIONS, ["o"]);
  });

  it("refuses when an outside actuator moves a joint of the subtree", () => {
    const before = {
      ...tree(),
      actuators: [
        {
          id: "cyl",
          name: "Cyl",
          assembly: "other",
          type: "double_acting_cylinder" as const,
          extendSpeed: 0.2,
          retractSpeed: 0.2,
          joints: ["hinge"],
        },
      ],
    };
    const error = refusal(() => deleteAssemblyWithContents(before, "chape", NO_POSITIONS));
    expect(error.message).toContain('moves joint "hinge"');
  });
});
