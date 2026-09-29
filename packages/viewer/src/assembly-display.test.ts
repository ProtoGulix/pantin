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
const { document } = pantinResponse(false, [
  railBody,
  stepBody("carriage", "Carriage"),
  { ...stepBody("jaw", "Jaw"), assembly: "gripper" },
]);

const KEYS = ["main", "gripper"];

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
  it("selects the assembly on a click and the body on a double click", () => {
    expect(pickedNodeId(document, "press", "jaw", false)).toBe(assemblyNodeId("press", "gripper"));
    expect(pickedNodeId(document, "press", "jaw", true)).toBe(bodyNodeId("press", "jaw"));
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
      withAssemblyHiddenToggled(NO_ASSEMBLY_DISPLAY, "spare", [...KEYS, "spare"]),
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
    expect(shown).toEqual({ hiddenAssemblyKeys: new Set(), isolatedAssemblyKey: null });
    const hidden = withAssemblyHiddenToggled(isolated, "gripper", KEYS);
    expect(hiddenBodyIds(document, hidden)).toEqual(new Set(["rail", "carriage", "jaw"]));
  });
});
