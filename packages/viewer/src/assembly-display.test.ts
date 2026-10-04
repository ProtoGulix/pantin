import type { Assembly } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  hiddenBodyIds,
  NO_ASSEMBLY_DISPLAY,
  pickedNodeId,
  selectedBodyIds,
  withAssemblyHiddenToggled,
  withAssemblyIsolationToggled,
  withAssemblyKeyRenamed,
  withAssemblyRemoved,
} from "./assembly-display.ts";
import { pantinResponse, railBody, stepBody } from "./test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId, sourceNodeNodeId } from "./tree/node-ids.ts";

// Two assemblies: "main" holds the rail and the carriage, "gripper" the jaw.
const placement = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
} satisfies Assembly["placement"];
const flat = pantinResponse(false, [
  railBody,
  stepBody("carriage", "Carriage"),
  { ...stepBody("jaw", "Jaw"), assembly: "gripper" },
]).document;
const document = {
  ...flat,
  assemblies: ["main", "gripper", "spare"].map((key) => ({ key, name: key, placement })),
};
const KEYS = document.assemblies;

describe("selectedBodyIds", () => {
  it("is the body of a body or source node, every body of an assembly, none otherwise", () => {
    expect(selectedBodyIds(document, bodyNodeId("press", "jaw"))).toEqual(new Set(["jaw"]));
    expect(selectedBodyIds(document, sourceNodeNodeId("press", "rail", 0))).toEqual(
      new Set(["rail"]),
    );
    expect(selectedBodyIds(document, assemblyNodeId("press", "main"))).toEqual(
      new Set(["rail", "carriage"]),
    );
    expect(selectedBodyIds(document, pantinNodeId("press"))).toEqual(new Set());
  });
});

describe("pickedNodeId", () => {
  it("selects the assembly on a click and the body on a double click after it", () => {
    expect(pickedNodeId(document, "press", "jaw", false, null)).toBe(
      assemblyNodeId("press", "gripper"),
    );
    expect(pickedNodeId(document, "press", "jaw", true, assemblyNodeId("press", "gripper"))).toBe(
      bodyNodeId("press", "jaw"),
    );
  });

  it("goes one level down per double click along the nesting, down to the body", () => {
    const nested = {
      ...document,
      assemblies: [
        ...document.assemblies.filter((assembly) => assembly.key !== "gripper"),
        { key: "gripper", name: "gripper", placement, parent: "main" },
      ],
    };
    const pick = (selected: string | null, double: boolean) =>
      pickedNodeId(nested, "press", "jaw", double, selected);
    const main = assemblyNodeId("press", "main");
    expect(pick(null, false)).toBe(main);
    expect(pick(main, false)).toBe(main);
    expect(pick(main, true)).toBe(assemblyNodeId("press", "gripper"));
    expect(pick(assemblyNodeId("press", "gripper"), true)).toBe(bodyNodeId("press", "jaw"));
    // Not an ancestor of the picked body: start again from the top.
    expect(pick(assemblyNodeId("press", "spare"), true)).toBe(main);
  });
});

describe("a nested assembly", () => {
  const nested = {
    ...document,
    assemblies: [
      { key: "main", name: "main", placement },
      { key: "gripper", name: "gripper", placement, parent: "main" },
      { key: "spare", name: "spare", placement },
    ],
  };

  it("hides, then shows again, its whole subtree", () => {
    const hidden = withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "main", nested.assemblies);
    expect(hiddenBodyIds(nested, hidden)).toEqual(new Set(["rail", "carriage", "jaw"]));
    const shown = withAssemblyHiddenToggled(hidden, "main", nested.assemblies);
    expect(hiddenBodyIds(nested, shown)).toEqual(new Set());
  });

  it("shows a sub-assembly alone after its container was hidden", () => {
    const hidden = withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "main", nested.assemblies);
    const shown = withAssemblyHiddenToggled(hidden, "gripper", nested.assemblies);
    expect(shown.hiddenAssemblyKeys.has("gripper")).toBe(false);
    expect(shown.hiddenAssemblyKeys.has("main")).toBe(false);
  });

  it("isolates the whole subtree", () => {
    const isolated = withAssemblyIsolationToggled(NO_ASSEMBLY_DISPLAY, "main");
    expect(hiddenBodyIds(nested, isolated)).toEqual(new Set());
    expect(
      hiddenBodyIds(
        { ...nested, bodies: nested.bodies },
        { ...isolated, isolatedAssemblyKey: "spare" },
      ),
    ).toEqual(new Set(["rail", "carriage", "jaw"]));
  });

  it("tints the bodies of its subtree when selected", () => {
    expect(selectedBodyIds(nested, assemblyNodeId("press", "main"))).toEqual(
      new Set(["rail", "carriage", "jaw"]),
    );
  });
});

describe("hiding and isolating assemblies", () => {
  it("hides the bodies of a hidden assembly, and shows them again on a second toggle", () => {
    const hidden = withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "main", KEYS);
    expect(hiddenBodyIds(document, hidden)).toEqual(new Set(["rail", "carriage"]));
    const shown = withAssemblyHiddenToggled(hidden, "main", KEYS);
    expect(hiddenBodyIds(document, shown)).toEqual(new Set());
  });

  it("shows only an isolated assembly, whatever is hidden, until it is isolated again", () => {
    const hidden = withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "gripper", KEYS);
    const isolated = withAssemblyIsolationToggled(hidden, "gripper");
    expect(hiddenBodyIds(document, isolated)).toEqual(new Set(["rail", "carriage"]));
    expect(withAssemblyIsolationToggled(isolated, "gripper").isolatedAssemblyKey).toBeNull();
  });

  it("follows a renamed assembly key", () => {
    const display = withAssemblyIsolationToggled(
      withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "main", KEYS),
      "main",
    );
    expect(withAssemblyKeyRenamed(display, "main", "frame")).toEqual({
      hiddenAssemblyKeys: new Set(["frame"]),
      isolatedAssemblyKey: "frame",
    });
  });
});

describe("withAssemblyRemoved", () => {
  it("forgets a deleted assembly, so that its isolation cannot hide every body", () => {
    const isolated = withAssemblyIsolationToggled(
      withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "spare", KEYS),
      "spare",
    );
    const removed = withAssemblyRemoved(isolated, "spare");
    expect(removed).toEqual(NO_ASSEMBLY_DISPLAY);
    expect(hiddenBodyIds(document, removed)).toEqual(new Set());
  });
});

describe("the eye of an assembly during an isolation", () => {
  it("turns the isolation into hidden assemblies, then shows the one clicked", () => {
    const isolated = withAssemblyIsolationToggled(NO_ASSEMBLY_DISPLAY, "gripper");
    const shown = withAssemblyHiddenToggled(isolated, "main", KEYS);
    expect(shown).toEqual({ hiddenAssemblyKeys: new Set(["spare"]), isolatedAssemblyKey: null });
    const hidden = withAssemblyHiddenToggled(isolated, "gripper", KEYS);
    expect(hiddenBodyIds(document, hidden)).toEqual(new Set(["rail", "carriage", "jaw"]));
  });
});
