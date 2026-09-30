import type { Drive, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { driveFormForJoint } from "../drives/drive-form.ts";
import { createTranslator } from "../i18n/translate.ts";
import { jointPreviewOf } from "../joints/joint-preview.ts";
import { buildContextMenuView } from "../panel/context-menu-model.ts";
import { hingeJoint, pantinResponse, railBody, stepBody, weldJoint } from "../test-fixtures.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildPropertyGroups } from "./properties-model.ts";

// A joint and its drive, from the joint's side (ADR 0022): its properties,
// its context menu, and the colour of its arrow.

const valve: Drive = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "main",
  joints: ["hinge"],
  type: "double_acting_cylinder",
  speed: 1,
};
const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  hingeJoint,
  weldJoint,
]);
const withValve: PantinResponse = {
  ...response,
  document: { ...response.document, drives: [valve] },
};
const translate = createTranslator("fr");
const opened = (pantin: PantinResponse) => withOpenPantin(initialViewerState("fr"), pantin);

const driveGroup = (jointId: string, pantin: PantinResponse = withValve) =>
  buildPropertyGroups(
    { ...opened(pantin), language: "fr" },
    jointNodeId("press", jointId),
    new Set(),
    translate,
  ).find((group) => group.id === "drive");

describe("a joint's drive in its properties", () => {
  it("names the drive, its type and its command tags", () => {
    expect(driveGroup("hinge")?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Drive", "Valve · Vérin double effet"],
      ["Commandes", "main.valve.extend, main.valve.retract"],
    ]);
  });

  it("says how to add one when the joint has none", () => {
    expect(driveGroup("hinge", response)?.rows[0]?.value).toMatch(/^Aucun : clic droit/);
  });
});

describe("a joint's context menu and its drive", () => {
  const labels = (pantin: PantinResponse, jointId: string) =>
    buildContextMenuView(
      { ...opened(pantin), contextMenu: { nodeId: jointNodeId("press", jointId), x: 0, y: 0 } },
      translate,
    )?.entries.map((entry) => entry.label);

  it("offers to add a drive, or to edit the one it has, never on a fixed joint", () => {
    expect(labels(response, "hinge")).toContain("Ajouter un drive…");
    expect(labels(withValve, "hinge")).toContain("Modifier son drive…");
    expect(labels(response, "weld")?.some((label) => label.includes("drive"))).toBe(false);
  });

  it("opens a new drive already connected to the joint, or its own drive", () => {
    expect(driveFormForJoint(response.document, "hinge")).toMatchObject({
      driveId: null,
      name: "Hinge",
      assembly: "main",
      joints: ["hinge"],
    });
    expect(driveFormForJoint(withValve.document, "hinge")?.driveId).toBe("valve");
    expect(driveFormForJoint(response.document, "weld")).toBeNull();
  });
});

describe("the joint arrow and its drive", () => {
  it("is marked driven when a drive moves the selected joint", () => {
    const selected = (pantin: PantinResponse) => ({
      ...opened(pantin),
      selectedNodeId: jointNodeId("press", "hinge"),
    });
    expect(jointPreviewOf(selected(withValve))?.driven).toBe(true);
    expect(jointPreviewOf(selected(response))?.driven).toBe(false);
  });
});
