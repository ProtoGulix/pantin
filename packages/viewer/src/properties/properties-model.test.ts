import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { hingeJoint, pantinResponse, screwJoint, spinJoint, stepBody } from "../test-fixtures.ts";
import {
  bodyNodeId,
  folderNodeId,
  jointNodeId,
  pantinNodeId,
  sourceNodeNodeId,
} from "../tree/node-ids.ts";
import { buildPropertyGroups, type PropertyGroup } from "./properties-model.ts";

const translate = createTranslator("fr");
const source = { openPantin: pantinResponse(true) };

function table(groups: PropertyGroup[]) {
  return groups.map((group) => [group.title, group.rows.map((row) => [row.label, row.value])]);
}

describe("buildPropertyGroups", () => {
  it("is empty without selection", () => {
    expect(buildPropertyGroups(source, null, new Set(), translate)).toEqual([]);
  });

  it("describes the open Pantin, with an editable name", () => {
    const groups = buildPropertyGroups(source, pantinNodeId("press"), new Set(), translate);
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "Press"],
          ["Identifiant", "press"],
          ["Nombre de corps", "1"],
          ["Modifications non sauvegardées", "Oui"],
        ],
      ],
    ]);
    expect(groups[0]?.rows[0]?.renameNodeId).toBe(pantinNodeId("press"));
    expect(groups[0]?.rows[1]?.renameNodeId).toBeNull();
  });

  it("is empty for a Pantin that is not the open one", () => {
    expect(buildPropertyGroups(source, pantinNodeId("robot"), new Set(), translate)).toEqual([]);
  });
});

describe("buildPropertyGroups for bodies and nodes", () => {
  it("describes a body: general, source, mesh and original nodes", () => {
    const groups = buildPropertyGroups(source, bodyNodeId("press", "rail"), new Set(), translate);
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "Linear rail"],
          ["Identifiant", "rail"],
        ],
      ],
      [
        "Source",
        [
          ["Fichier", "3630.glb"],
          ["Format", "GLB"],
          ["Unité", "m (mètres)"],
          ["Axe vertical", "Z vers le haut (CAO)"],
        ],
      ],
      ["Maillage", [["Fichier maillage", "meshes/rail.glb"]]],
      [
        "Nœuds d'origine",
        [
          ["0/0", "3630.00.0800N_0"],
          ["0/1", "(nœud sans nom)"],
        ],
      ],
    ]);
    expect(groups[3]?.rows.every((row) => row.muted && row.renameNodeId === null)).toBe(true);
  });
});

describe("buildPropertyGroups for other nodes", () => {
  it("shows the STEP format of a converted body", () => {
    const stepSource = {
      openPantin: pantinResponse(false, [stepBody("carriage", "N_1")]),
    };
    const groups = buildPropertyGroups(
      stepSource,
      bodyNodeId("press", "carriage"),
      new Set(),
      translate,
    );
    expect(groups[1]?.rows[1]?.value).toBe("STEP");
  });

  it("describes a source node, read-only", () => {
    const groups = buildPropertyGroups(
      source,
      sourceNodeNodeId("press", "rail", 0),
      new Set(),
      translate,
    );
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom d'origine", "3630.00.0800N_0"],
          ["Chemin", "0/0"],
        ],
      ],
    ]);
  });
});

describe("buildPropertyGroups for folders and group state", () => {
  it("describes the Corps folder", () => {
    const groups = buildPropertyGroups(
      source,
      folderNodeId("press", "bodies"),
      new Set(),
      translate,
    );
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "Corps"],
          ["Nombre d'éléments", "1"],
        ],
      ],
    ]);
  });

  it("marks collapsed groups by id, whatever the node", () => {
    const groups = buildPropertyGroups(
      source,
      bodyNodeId("press", "rail"),
      new Set(["source"]),
      translate,
    );
    expect(groups.map((group) => group.collapsed)).toEqual([false, true, false, false]);
  });

  it("is empty for a node that no longer exists", () => {
    expect(buildPropertyGroups(source, bodyNodeId("press", "ghost"), new Set(), translate)).toEqual(
      [],
    );
  });
});

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
  it("shows the type, the bodies by name, and origin and axis in millimetres", () => {
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
          ["Origine (mm)", "10, 0, 20"],
          ["Axe", "0, 0, 1"],
        ],
      ],
    ]);
  });
});

describe("joint parameters and folder", () => {
  it("shows each declared parameter in display units", () => {
    expect(groupsOf("hinge")[2]).toEqual(["Paramètres", [["Limites", "-90 … 90 °"]]]);
    expect(groupsOf("screw")[2]).toEqual([
      "Paramètres",
      [
        ["Limites", "0 … 50 mm"],
        ["Pas (course par tour)", "2 mm"],
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
