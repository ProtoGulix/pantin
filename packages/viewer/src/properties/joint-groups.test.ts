import { JOINT_COORDINATE_UNITS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { hingeJoint, pantinResponse, screwJoint, spinJoint, stepBody } from "../test-fixtures.ts";
import { bodyNodeId, folderNodeId, jointNodeId } from "../tree/node-ids.ts";
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
  it("shows the type, the bodies by name, the axis as a direction and the origin", () => {
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
          ["Axe", "Z"],
          ["Sens", "Positif (+)"],
          ["Origine X (mm)", "10"],
          ["Origine Y (mm)", "0"],
          ["Origine Z (mm)", "20"],
        ],
      ],
    ]);
  });

  it("lists the components of an oblique axis after its direction and sense", () => {
    const oblique = { ...hingeJoint, axis: [0, -1, 1] satisfies [number, number, number] };
    const source = {
      openPantin: pantinResponse(false, [stepBody("rail", "Rail")], "press", [oblique]),
    };
    const placement = table(
      buildPropertyGroups(source, jointNodeId("press", "hinge"), new Set(), translate),
    )[1];
    expect(placement?.[1]?.slice(0, 5)).toEqual([
      ["Axe", "Autre"],
      ["Sens", "Inversé (−)"],
      ["Axe X", "0"],
      ["Axe Y", "-1"],
      ["Axe Z", "1"],
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
      ["axis-direction", target("axis.direction")],
      ["axis-sense", target("axis.sense")],
      ["origin.x", target("origin.x")],
      ["origin.y", target("origin.y")],
      ["origin.z", target("origin.z")],
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

describe("joints of a body", () => {
  const bodyRows = (bodyId: string) =>
    buildPropertyGroups(jointSource, bodyNodeId("press", bodyId), new Set(), translate).find(
      (group) => group.id === "joints",
    )?.rows ?? [];

  it("lists every joint holding the body, with its type and the other body", () => {
    const rows = bodyRows("rail");
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Hinge", "Pivot limité, parent de « Carriage »"],
      ["Screw", "Hélicoïdale (vis et écrou), parent de « Carriage »"],
      ["Spin", "Pivot continu, parent de « Carriage »"],
    ]);
    expect(bodyRows("carriage")[0]?.value).toBe("Pivot limité, enfant de « Rail »");
  });

  it("links each row to its joint in the tree, read-only", () => {
    const hinge = bodyRows("carriage")[0];
    expect(hinge?.link).toBe(jointNodeId("press", "hinge"));
    expect(hinge?.edit).toBeNull();
  });
});
