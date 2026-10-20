import { describe, expect, it } from "vitest";
import { conveyorPantin } from "../conveyors/conveyor-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import type { PropertyGroup } from "../properties/property-rows.ts";
import { withNode } from "../test-fixtures.ts";
import { pantinNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { conveyorToolViews, spawnViewOf } from "./conveyor-tools.ts";
import { buildInspectorView } from "./inspector-model.ts";

// The inspector of the phase 6 objects (ADR 0043 point 13).

const t = createTranslator("fr");
const pantin = conveyorPantin();
const opened = withOpenPantin(initialViewerState("fr"), pantin);

const select = (kind: "belt" | "guide" | "emitter" | "absorber" | "presenceSensor", id: string) =>
  buildInspectorView(withSelection(opened, { kind, id }), t, false);
const rowOf = (groups: PropertyGroup[], group: string, row: string) =>
  groups
    .find((candidate) => candidate.id === group)
    ?.rows.find((candidate) => candidate.id === row);

describe("the inspector of a belt", () => {
  const view = select("belt", "feed");

  it("names it and shows its frame, placement and sizes in millimetres", () => {
    expect(view.subject).toBe("Bande · Feed");
    expect(view.device).toEqual({ kind: "belt", id: "feed" });
    expect(rowOf(view.groups, "conveyorFrame", "assembly")?.value).toBe("main");
    expect(rowOf(view.groups, "conveyorFrame", "body")?.value).toBe(
      "aucun (repère de l'assemblage)",
    );
    expect(rowOf(view.groups, "conveyorPlacement", "placement-z")?.value).toBe("500");
    expect(rowOf(view.groups, "parameters", "parameter-length")?.value).toBe("1000");
  });

  it("edits a size in place as a field of the device, and the drum as a choice", () => {
    expect(rowOf(view.groups, "parameters", "parameter-length")?.edit).toEqual({
      input: "text",
      target: { kind: "deviceField", device: { kind: "belt", id: "feed" }, fieldId: "length" },
    });
    const drum = rowOf(view.groups, "parameters", "parameter-drumJoint");
    expect(drum?.edit).toMatchObject({ input: "select", selected: "spin" });
    expect(drum?.value).toBe("Spin");
  });

  it("has no spawn button and no live state", () => {
    expect(view.spawn).toBeNull();
    expect(view.groups.some((group) => group.id === "state")).toBe(false);
  });
});

describe("the inspector of an emitter", () => {
  const view = select("emitter", "source");

  it("shows the body it follows, its tag prefix and the live spawn bit", () => {
    expect(rowOf(view.groups, "conveyorFrame", "body")?.value).toBe("Linear rail");
    expect(rowOf(view.groups, "general", "tagPrefix")?.value).toBe("main.source");
    expect(rowOf(view.groups, "state", "spawn")?.live).toEqual({
      kind: "tag",
      tag: "main.source.spawn",
      unit: null,
      format: "bit",
    });
  });

  it("edits its tag key in place, as a joint does, before the read-only prefix", () => {
    const tagKey = rowOf(view.groups, "general", "tagKey");
    expect([tagKey?.label, tagKey?.value]).toEqual(["Clé de tag", "source"]);
    expect(tagKey?.edit).toEqual({
      input: "text",
      target: {
        kind: "conveyorTagKey",
        pantinId: "press",
        owner: { kind: "emitter", id: "source" },
      },
    });
  });

  it("offers the 'Créer un produit' button for this emitter only", () => {
    expect(view.spawn).toEqual({
      emitterId: "source",
      label: "Créer un produit",
      hint: expect.stringContaining("spawn"),
    });
    expect(spawnViewOf({ kind: "guide", id: "side" }, t)).toBeNull();
    expect(spawnViewOf(null, t)).toBeNull();
  });
});

describe("the inspector of a presence sensor", () => {
  const view = select("presenceSensor", "cell");

  it("shows its type, its range in millimetres and its delays in milliseconds", () => {
    expect(rowOf(view.groups, "general", "type")?.value).toBe("Cellule photoélectrique");
    expect(rowOf(view.groups, "parameters", "parameter-range")?.value).toBe("300");
    expect(rowOf(view.groups, "parameters", "parameter-offDelay")?.value).toBe("50");
    expect(rowOf(view.groups, "parameters", "parameter-normallyClosed")?.value).toBe("Non");
  });

  it("edits its tag key in place", () => {
    expect(rowOf(view.groups, "general", "tagKey")?.edit).toEqual({
      input: "text",
      target: {
        kind: "conveyorTagKey",
        pantinId: "press",
        owner: { kind: "presenceSensor", id: "cell" },
      },
    });
  });

  it("reads its state from the state tag, live", () => {
    expect(rowOf(view.groups, "state", "state")?.live).toMatchObject({
      kind: "tag",
      tag: "main.cell.state",
      format: "bit",
    });
  });
});

describe("the other objects", () => {
  it("have no tag key to edit, since they own no tag", () => {
    for (const [kind, id] of [
      ["belt", "feed"],
      ["guide", "side"],
      ["absorber", "sink"],
    ] as const) {
      expect(rowOf(select(kind, id).groups, "general", "tagKey")).toBeUndefined();
    }
  });
});

describe("the index of the Pantin", () => {
  it("lists every object with its kind, linked to its selection, a cell with its state", () => {
    const view = buildInspectorView(withNode(opened, pantinNodeId("press")), t, false);
    const rows = view.groups.find((group) => group.id === "objectIndex")?.rows ?? [];
    expect(rows.map((row) => [row.label, row.value, row.link])).toEqual([
      ["Feed", "Bande", { kind: "device", device: { kind: "belt", id: "feed" } }],
      ["Side", "Guide", { kind: "device", device: { kind: "guide", id: "side" } }],
      ["Source", "Émetteur", { kind: "device", device: { kind: "emitter", id: "source" } }],
      ["Sink", "Absorbeur", { kind: "device", device: { kind: "absorber", id: "sink" } }],
      [
        "Cell",
        "Cellule photoélectrique",
        { kind: "device", device: { kind: "presenceSensor", id: "cell" } },
      ],
    ]);
    expect(rows[4]?.live).toMatchObject({ kind: "tag", tag: "main.cell.state" });
    expect(view.hints).not.toContain(t("conveyors.empty"));
  });
});

describe("the create tools", () => {
  it("offers the five kinds, with a reason where a belt cannot be built", () => {
    expect(conveyorToolViews(pantin.document, t).map((tool) => tool.disabledReason)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    const noDrum = { ...pantin.document, joints: [] };
    const tools = conveyorToolViews(noDrum, t);
    expect(tools[0]?.disabledReason).toBe(t("conveyors.noDrumJoint"));
    expect(tools.slice(1).every((tool) => tool.disabledReason === null)).toBe(true);
  });

  it("is off for every kind while the Pantin has no assembly", () => {
    const none = { ...pantin.document, assemblies: [] };
    expect(conveyorToolViews(none, t).every((tool) => tool.disabledReason !== null)).toBe(true);
  });
});
