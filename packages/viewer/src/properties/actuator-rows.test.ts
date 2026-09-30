import type { Actuator, Drive, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { actuatorFormForJoint } from "../actuators/actuator-form.ts";
import { createTranslator } from "../i18n/translate.ts";
import { jointPreviewOf } from "../joints/joint-preview.ts";
import { buildContextMenuView } from "../panel/context-menu-model.ts";
import { hingeJoint, pantinResponse, railBody, stepBody, weldJoint } from "../test-fixtures.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildPropertyGroups } from "./properties-model.ts";

// A joint and its actuator, from the joint's side (ADR 0028): its properties,
// its context menu, and the colour of its arrow.

const valve: Drive = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "main",
  type: "valve_5_3_closed",
};
const cylinder: Actuator = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "main",
  type: "double_acting_cylinder",
  extendSpeed: 1,
  retractSpeed: 1,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["hinge"],
};
const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  hingeJoint,
  weldJoint,
]);
const withCylinder: PantinResponse = {
  ...response,
  document: { ...response.document, drives: [valve], actuators: [cylinder] },
};
const translate = createTranslator("fr");
const opened = (pantin: PantinResponse) => withOpenPantin(initialViewerState("fr"), pantin);

const actuatorGroup = (jointId: string, pantin: PantinResponse = withCylinder) =>
  buildPropertyGroups(
    { ...opened(pantin), language: "fr" },
    jointNodeId("press", jointId),
    new Set(),
    translate,
  ).find((group) => group.id === "actuator");

describe("a joint's actuator in its properties", () => {
  it("names the actuator, its drive and the command tags of that drive", () => {
    expect(actuatorGroup("hinge")?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Actionneur", "Cylinder · Vérin double effet"],
      ["Préactionneur", "Valve · Distributeur 5/3, centre fermé"],
      ["Commandes", "main.valve.coil_14, main.valve.coil_12"],
    ]);
  });

  it("says how to add one when the joint has none", () => {
    expect(actuatorGroup("hinge", response)?.rows[0]?.value).toMatch(/^Aucun : clic droit/);
  });
});

describe("a joint's context menu and its actuator", () => {
  const labels = (pantin: PantinResponse, jointId: string) =>
    buildContextMenuView(
      { ...opened(pantin), contextMenu: { nodeId: jointNodeId("press", jointId), x: 0, y: 0 } },
      translate,
    )?.entries.map((entry) => entry.label);

  it("offers to add an actuator, or to edit the one it has, never on a fixed joint", () => {
    expect(labels(response, "hinge")).toContain("Ajouter un actionneur…");
    expect(labels(withCylinder, "hinge")).toContain("Modifier son actionneur…");
    expect(labels(response, "weld")?.some((label) => label.includes("actionneur"))).toBe(false);
  });

  it("opens a new actuator already moving the joint, or its own actuator", () => {
    expect(actuatorFormForJoint(response.document, "hinge")).toMatchObject({
      actuatorId: null,
      name: "Hinge",
      assembly: "main",
      joints: ["hinge"],
    });
    expect(actuatorFormForJoint(withCylinder.document, "hinge")?.actuatorId).toBe("cylinder");
    expect(actuatorFormForJoint(response.document, "weld")).toBeNull();
  });
});

describe("the joint arrow and its actuator", () => {
  it("is marked driven when an actuator moves the selected joint", () => {
    const selected = (pantin: PantinResponse) => ({
      ...opened(pantin),
      selectedNodeId: jointNodeId("press", "hinge"),
    });
    expect(jointPreviewOf(selected(withCylinder))?.driven).toBe(true);
    expect(jointPreviewOf(selected(response))?.driven).toBe(false);
  });
});
