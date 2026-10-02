import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, sourceOf, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId, sourceNodeNodeId } from "../tree/node-ids.ts";
import { titledNodeGroups } from "./properties-test-helpers.ts";
import type { PropertyGroup } from "./property-rows.ts";

const translate = createTranslator("fr");
const source = { openPantin: pantinResponse(true) };

function table(groups: PropertyGroup[]) {
  return groups.map((group) => [group.title, group.rows.map((row) => [row.label, row.value])]);
}

describe("properties of the Pantin", () => {
  it("describes the open Pantin, with an editable name", () => {
    const groups = titledNodeGroups(sourceOf(source), pantinNodeId("press"), translate);
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
    expect(groups[0]?.rows[0]?.edit).toEqual({
      input: "text",
      target: { kind: "rename", nodeId: pantinNodeId("press") },
    });
    expect(groups[0]?.rows[1]?.edit).toBeNull();
  });

  it("is empty for a Pantin that is not the open one", () => {
    expect(titledNodeGroups(sourceOf(source), pantinNodeId("robot"), translate)).toEqual([]);
  });
});

describe("properties of bodies and nodes", () => {
  it("describes a body: general, joints, source, mesh and original nodes", () => {
    const groups = titledNodeGroups(sourceOf(source), bodyNodeId("press", "rail"), translate);
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "Linear rail"],
          ["Identifiant", "rail"],
          ["Assemblage", "main"],
        ],
      ],
      ["Liaisons", [["Aucune liaison", ""]]],
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
    expect(groups[4]?.rows.every((row) => row.muted && row.edit === null)).toBe(true);
  });
});

describe("properties of other nodes", () => {
  it("shows the STEP format of a converted body", () => {
    const stepSource = {
      openPantin: pantinResponse(false, [stepBody("carriage", "N_1")]),
    };
    const groups = titledNodeGroups(
      sourceOf(stepSource),
      bodyNodeId("press", "carriage"),
      translate,
    );
    expect(groups[2]?.rows[1]?.value).toBe("STEP");
  });

  it("describes a source node, read-only", () => {
    const groups = titledNodeGroups(
      sourceOf(source),
      sourceNodeNodeId("press", "rail", 0),
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

describe("properties of a missing node", () => {
  it("is empty for a node that no longer exists", () => {
    expect(titledNodeGroups(sourceOf(source), bodyNodeId("press", "ghost"), translate)).toEqual([]);
  });
});

describe("properties of assemblies (ADR 0019)", () => {
  it("describes an assembly: its name, its key, which prefixes tags, and its bodies", () => {
    const groups = titledNodeGroups(sourceOf(source), assemblyNodeId("press", "main"), translate);
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "main"],
          ["Clé (préfixe des tags)", "main"],
          ["Nombre de corps", "1"],
        ],
      ],
      [
        "Placement",
        [
          ["Repère", "monde"],
          ["X (mm)", "0"],
          ["Y (mm)", "0"],
          ["Z (mm)", "0"],
          ["RX (°)", "0"],
          ["RY (°)", "0"],
          ["RZ (°)", "0"],
        ],
      ],
    ]);
    const key = groups[0]?.rows.find((entry) => entry.id === "key");
    expect(key?.edit).toEqual({
      input: "text",
      target: { kind: "assemblyKey", pantinId: "press", key: "main" },
    });
  });

  it("lets a body move to another assembly with a select", () => {
    const groups = titledNodeGroups(sourceOf(source), bodyNodeId("press", "rail"), translate);
    const assembly = groups[0]?.rows.find((entry) => entry.id === "assembly");
    expect(assembly?.edit).toEqual({
      input: "select",
      target: { kind: "bodyAssembly", pantinId: "press", bodyId: "rail" },
      options: [{ value: "main", label: "main" }],
      selected: "main",
    });
  });
});
