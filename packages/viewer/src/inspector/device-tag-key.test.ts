import { describe, expect, it } from "vitest";
import { bodyOf, documentOf, driveOf, encoderOf, jointOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildInspectorView } from "./inspector-model.ts";

// The tag key of a drive and of a joint sensor is edited in place, like a
// joint's (ADR 0019); the prefix next to it stays read-only.

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a")],
  joints: [jointOf("j1", "s1")],
  drives: [driveOf("v1", "a")],
  actuators: [],
  sensors: [encoderOf("e1", "a", "j1")],
});
const opened = withOpenPantin(initialViewerState("fr"), {
  id: "press",
  unsavedChanges: false,
  changedOutside: [],
  document,
});

function generalRows(kind: "drive" | "sensor", id: string) {
  const view = buildInspectorView(
    withSelection(opened, { kind, id }),
    createTranslator("fr"),
    false,
  );
  return view.groups.find((group) => group.id === "general")?.rows ?? [];
}

describe.each([
  ["drive", "v1"],
  ["sensor", "e1"],
] as const)("the inspector of a %s", (kind, id) => {
  it("edits its tag key in place, before the read-only prefix", () => {
    const rows = generalRows(kind, id);
    const tagKey = rows.find((row) => row.id === "tagKey");
    expect([tagKey?.label, tagKey?.value]).toEqual(["Clé de tag", id]);
    expect(tagKey?.edit).toEqual({
      input: "text",
      target: { kind: "deviceTagKey", pantinId: "press", device: { kind, id } },
    });
    const prefix = rows.find((row) => row.id === "tagPrefix");
    expect([prefix?.value, prefix?.edit]).toEqual([`a.${id}`, null]);
    expect(rows.map((row) => row.id).slice(-2)).toEqual(["tagKey", "tagPrefix"]);
  });
});
