import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId, sourceNodeNodeId } from "../tree/node-ids.ts";
import { buildPropertyGroups } from "./properties-model.ts";
import type { PropertyGroup } from "./property-rows.ts";

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
    expect(groups[0]?.rows[0]?.edit).toEqual({
      input: "text",
      target: { kind: "rename", nodeId: pantinNodeId("press") },
    });
    expect(groups[0]?.rows[1]?.edit).toBeNull();
  });

  it("is empty for a Pantin that is not the open one", () => {
    expect(buildPropertyGroups(source, pantinNodeId("robot"), new Set(), translate)).toEqual([]);
  });
});

describe("buildPropertyGroups for bodies and nodes", () => {
  it("describes a body: general, joints, source, mesh and original nodes", () => {
    const groups = buildPropertyGroups(source, bodyNodeId("press", "rail"), new Set(), translate);
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
    expect(groups[2]?.rows[1]?.value).toBe("STEP");
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
  it("marks collapsed groups by id, whatever the node", () => {
    const groups = buildPropertyGroups(
      source,
      bodyNodeId("press", "rail"),
      new Set(["source"]),
      translate,
    );
    expect(groups.map((group) => group.collapsed)).toEqual([false, false, true, false, false]);
  });

  it("is empty for a node that no longer exists", () => {
    expect(buildPropertyGroups(source, bodyNodeId("press", "ghost"), new Set(), translate)).toEqual(
      [],
    );
  });
});

describe("buildPropertyGroups for assemblies (ADR 0019)", () => {
  it("describes an assembly: its name, its key, which prefixes tags, and its bodies", () => {
    const groups = buildPropertyGroups(
      source,
      assemblyNodeId("press", "main"),
      new Set(),
      translate,
    );
    expect(table(groups)).toEqual([
      [
        "Général",
        [
          ["Nom", "main"],
          ["Clé (préfixe des tags)", "main"],
          ["Nombre de corps", "1"],
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
    const groups = buildPropertyGroups(source, bodyNodeId("press", "rail"), new Set(), translate);
    const assembly = groups[0]?.rows.find((entry) => entry.id === "assembly");
    expect(assembly?.edit).toEqual({
      input: "select",
      target: { kind: "bodyAssembly", pantinId: "press", bodyId: "rail" },
      options: [{ value: "main", label: "main" }],
      selected: "main",
    });
  });
});
