import type { Body, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { fieldsToPlacement } from "../placement-units.ts";
import { hingeJoint, pantinResponse, railBody, sourceOf, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId } from "../tree/node-ids.ts";
import { titledNodeGroups } from "./properties-test-helpers.ts";

// The Placement group (ADR 0034 points 1, 2 and 6).

const t = createTranslator("fr");
const turned = fieldsToPlacement({ x: 250, y: -10, z: 0.5, rx: 0, ry: 0, rz: 90 });

function twoAssemblies(extraBody?: Partial<Body>): PantinResponse {
  const base = pantinResponse(false, [
    railBody,
    { ...stepBody("carriage", "N_1"), assembly: "clevis", ...extraBody },
  ]);
  return {
    ...base,
    document: {
      ...base.document,
      assemblies: [
        base.document.assemblies[0] ?? { key: "main", name: "main", placement: turned },
        { key: "clevis", name: "Chape", placement: turned },
      ],
      joints: [hingeJoint],
    },
  };
}

function placementGroup(pantin: PantinResponse, nodeId: string) {
  const groups = titledNodeGroups(sourceOf({ openPantin: pantin }), nodeId, t);
  return groups.find((group) => group.id === "assemblyPlacement");
}

describe("placement of an assembly", () => {
  it("lists X, Y, Z in mm and RX, RY, RZ in degrees, editable, with the anchor first", () => {
    const group = placementGroup(twoAssemblies(), assemblyNodeId("press", "clevis"));
    expect(group?.title).toBe("Placement");
    expect(group?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Repère", "main"],
      ["X (mm)", "250"],
      ["Y (mm)", "-10"],
      ["Z (mm)", "0.5"],
      ["RX (°)", "0"],
      ["RY (°)", "0"],
      ["RZ (°)", "90"],
    ]);
    expect(group?.rows[0]?.edit).toBeNull();
    expect(group?.rows[6]?.edit).toEqual({
      input: "text",
      target: { kind: "assemblyPlacement", pantinId: "press", key: "clevis", field: "rz" },
    });
  });

  it("names the world as the frame of an assembly with no incoming joint", () => {
    const group = placementGroup(twoAssemblies(), assemblyNodeId("press", "main"));
    expect(group?.rows[0]).toMatchObject({ label: "Repère", value: "monde" });
  });
});

describe("placement of a body", () => {
  it("is shown read only when the body has one, in the frame of its assembly", () => {
    const group = placementGroup(
      twoAssemblies({ placement: turned }),
      bodyNodeId("press", "carriage"),
    );
    expect(group?.rows[0]).toMatchObject({ label: "Repère", value: "Chape" });
    expect(group?.rows[1]).toMatchObject({ label: "X (mm)", value: "250" });
    expect(group?.rows.every((row) => row.edit === null)).toBe(true);
  });

  it("is absent for a body without one", () => {
    expect(placementGroup(twoAssemblies(), bodyNodeId("press", "carriage"))).toBeUndefined();
  });
});
