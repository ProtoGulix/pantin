import { JOINT_COORDINATE_UNITS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { hingeJoint, pantinResponse, screwJoint, spinJoint, stepBody } from "../test-fixtures.ts";
import { folderNodeId, jointNodeId } from "../tree/node-ids.ts";
import { buildPropertyGroups } from "./properties-model.ts";
import type { PropertyGroup } from "./property-rows.ts";

const translate = createTranslator("fr");

function table(groups: PropertyGroup[]) {
  return groups.map((group) => [group.title, group.rows.map((row) => [row.label, row.value])]);
}

const jointSource = {
  openPantin: pantinResponse(
    false,
    [stepBody("rail", "Rail"), stepBody("carriage", "Carriage")],
    "press",
    [hingeJoint, screwJoint, spinJoint],
  ),
};
const groupsOf = (jointId: string) =>
  table(buildPropertyGroups(jointSource, jointNodeId("press", jointId), new Set(), translate));

describe("joint properties", () => {
  it("shows the type, the bodies by name, and origin and axis by component", () => {
    expect(groupsOf("hinge").slice(0, 2)).toEqual([
      [
        "Général",
        [
          ["Nom", "Hinge"],
          ["Identifiant", "hinge"],
          ["Type", "Pivot limité"],
          ["Corps parent", "Rail"],
          ["Corps enfant", "Carriage"],
        ],
      ],
      [
        "Position",
        [
          ["Origine X (mm)", "10"],
          ["Origine Y (mm)", "0"],
          ["Origine Z (mm)", "20"],
          ["Axe X", "0"],
          ["Axe Y", "0"],
          ["Axe Z", "1"],
        ],
      ],
    ]);
  });
});

describe("joint parameters and folder", () => {
  it("shows each declared parameter in display units, one row per input", () => {
    expect(groupsOf("hinge")[2]).toEqual([
      "Paramètres",
      [
        ["Limites, min (°)", "-90"],
        ["Limites, max (°)", "90"],
      ],
    ]);
    expect(groupsOf("screw")[2]).toEqual([
      "Paramètres",
      [
        ["Limites, min (mm)", "0"],
        ["Limites, max (mm)", "50"],
        ["Pas (course par tour) (mm)", "2"],
      ],
    ]);
  });

  it("has no parameter group for a joint without parameters", () => {
    expect(groupsOf("spin")).toHaveLength(2);
  });

  it("describes the joints folder by its own label and count", () => {
    const groups = buildPropertyGroups(
      jointSource,
      folderNodeId("press", "joints"),
      new Set(),
      translate,
    );
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "Liaisons"],
          ["Nombre d'éléments", "3"],
        ],
      ],
    ]);
  });
});

describe("joint edit targets", () => {
  const rowsOf = (jointId: string) =>
    buildPropertyGroups(jointSource, jointNodeId("press", jointId), new Set(), translate).flatMap(
      (group) => group.rows,
    );
  const target = (fieldId: string) => ({
    kind: "jointField",
    pantinId: "press",
    jointId: "hinge",
    fieldId,
  });

  it("edits everything but the id and the type", () => {
    const edits = rowsOf("hinge").map((r) => [r.id, r.edit?.target ?? null]);
    expect(edits).toEqual([
      ["name", target("name")],
      ["id", null],
      ["type", null],
      ["parent", target("parent")],
      ["child", target("child")],
      ["origin.x", target("origin.x")],
      ["origin.y", target("origin.y")],
      ["origin.z", target("origin.z")],
      ["axis.x", target("axis.x")],
      ["axis.y", target("axis.y")],
      ["axis.z", target("axis.z")],
      ["parameter-limits.lower", target("limits.lower")],
      ["parameter-limits.upper", target("limits.upper")],
    ]);
  });

  it("edits the bodies with a select over the Pantin's bodies", () => {
    const parent = rowsOf("hinge").find((r) => r.id === "parent");
    expect(parent?.edit).toEqual({
      input: "select",
      target: target("parent"),
      selected: "rail",
      options: [
        { value: "rail", label: "Rail" },
        { value: "carriage", label: "Carriage" },
      ],
    });
    expect(rowsOf("hinge").find((r) => r.id === "name")?.edit?.input).toBe("text");
  });
});

describe("joint values in display units", () => {
  const rowsOf = (jointId: string) =>
    buildPropertyGroups(jointSource, jointNodeId("press", jointId), new Set(), translate).flatMap(
      (group) => group.rows,
    );

  it("shows limits in the display unit of the coordinate, chosen from the protocol", () => {
    const withRange = [hingeJoint, screwJoint].map((joint) => ({
      unit: JOINT_COORDINATE_UNITS[joint.type],
      id: joint.id,
    }));
    expect(withRange.map((entry) => entry.unit)).toEqual(["radian", "metre"]);
    const limitsOf = (jointId: string) =>
      rowsOf(jointId)
        .filter((r) => r.id.startsWith("parameter-limits"))
        .map((r) => r.value);
    expect(limitsOf("hinge")).toEqual(["-90", "90"]);
    expect(limitsOf("screw")).toEqual(["0", "50"]);
    expect(rowsOf("screw").find((r) => r.id === "parameter-pitch.value")?.value).toBe("2");
  });
});
