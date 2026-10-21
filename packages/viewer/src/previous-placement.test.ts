import type { AssemblyDeletionResponse, Placement } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { withAssemblyContentsDeleted } from "./assembly-deletion-state.ts";
import { testStore } from "./controller/controller-test-helpers.ts";
import {
  dragPlacement,
  finishPlacementDrag,
  restorePreviousPlacement,
  setPlacementField,
} from "./controller/placement-actions.ts";
import { bodyOf, documentOf, jointOf } from "./diagram/diagram-fixtures.ts";
import { createTranslator } from "./i18n/translate.ts";
import { buildPositioningView } from "./inspector/positioning-view.ts";
import { fieldsToPlacement } from "./placement-units.ts";
import { restorableOf, withPreviousPlacementKeyRenamed } from "./previous-placement.ts";
import { withPantinClosed } from "./session-state.ts";
import { withNode } from "./test-fixtures.ts";
import { assemblyNodeId } from "./tree/node-ids.ts";
import { withOpenPantin } from "./viewer-state.ts";

// "Rétablir le placement précédent" (ADR 0039 point 11): one value per
// assembly, kept while the anchor is unchanged, forgotten with the Pantin.

const start = fieldsToPlacement({ x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
const base = documentOf({ assemblies: ["a", "block"], bodies: [bodyOf("block", "block")] });
const pantin = {
  id: "bench",
  unsavedChanges: false,
  changedOutside: [],
  document: {
    ...base,
    assemblies: base.assemblies.map((assembly) => ({ ...assembly, placement: start })),
  },
};
// The same Pantin where a fixed joint now anchors "block" to "a".
const anchored = {
  ...pantin,
  document: {
    ...pantin.document,
    joints: [{ ...jointOf("link", "block", "fixed"), child: { kind: "assembly", key: "block" } }],
  },
} as typeof pantin;
const answer = { placement: start, anchor: { kind: "world" as const } };
const t = createTranslator("fr");

function openStore() {
  const sent: Placement[] = [];
  const store = testStore({
    getPantin: async () => pantin,
    listPantins: async () => [],
    setAssemblyPlacement: async (_id, _key, placement) => {
      sent.push(placement);
      return answer;
    },
  });
  store.requestedPantinId = pantin.id;
  store.state = withNode(withOpenPantin(store.state, pantin), assemblyNodeId("bench", "block"));
  return { store, sent };
}

const typed = { kind: "assemblyPlacement", pantinId: "bench", key: "block", field: "x" } as const;

describe("restoring the previous placement", () => {
  it("offers a typed edit once, then nothing", async () => {
    const { store, sent } = openStore();
    await setPlacementField(store, typed, "250");
    expect(restorableOf(store.state, "block")).toEqual({ kind: "ready", placement: start });
    await restorePreviousPlacement(store);
    expect(sent[1]).toEqual(start);
    expect(restorableOf(store.state, "block")).toEqual({ kind: "nothing" });
    await restorePreviousPlacement(store);
    expect(sent).toHaveLength(2);
  });

  it("keeps the placement at the start of a drag, not an intermediate value", async () => {
    const { store, sent } = openStore();
    const at = (x: number): Placement => ({ translation: [x, 0, 0], rotation: [0, 0, 0, 1] });
    dragPlacement(store, "block", at(0.2));
    dragPlacement(store, "block", at(0.3));
    await finishPlacementDrag(store);
    await restorePreviousPlacement(store);
    expect(sent.at(-1)).toEqual(start);
  });

  it("replaces the value at each new edit: one value, not a history", async () => {
    const { store, sent } = openStore();
    await setPlacementField(store, typed, "250");
    store.state = withOpenPantin(store.state, {
      ...pantin,
      document: {
        ...pantin.document,
        assemblies: pantin.document.assemblies.map((assembly) => ({
          ...assembly,
          placement: fieldsToPlacement({ x: 250, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }),
        })),
      },
    });
    await setPlacementField(store, typed, "300");
    await restorePreviousPlacement(store);
    expect(sent.at(-1)?.translation[0]).toBeCloseTo(0.25);
  });
});

describe("forgetting the previous placement", () => {
  it("is not offered once the anchor changed, with the reason in the tooltip", async () => {
    const { store, sent } = openStore();
    await setPlacementField(store, typed, "250");
    store.state = withOpenPantin(store.state, anchored);
    expect(restorableOf(store.state, "block")).toEqual({ kind: "anchorChanged" });
    const view = buildPositioningView(store.state, t, false);
    expect(view?.restore.disabled).toBe(true);
    expect(view?.restore.title).toContain("ancrage");
    await restorePreviousPlacement(store);
    expect(sent).toHaveLength(1);
  });

  it("is disabled with a reason when nothing was edited", () => {
    const { store } = openStore();
    const view = buildPositioningView(store.state, t, false);
    expect(view?.restore).toMatchObject({
      disabled: true,
      label: "Rétablir le placement précédent",
    });
    expect(view?.restore.title).toContain("Rétablir le placement précédent");
  });

  it("is forgotten when the Pantin is closed or another one opens", async () => {
    const { store } = openStore();
    await setPlacementField(store, typed, "250");
    expect(withPantinClosed(store.state).previousPlacements.size).toBe(0);
    const other = withOpenPantin(store.state, { ...pantin, id: "other" });
    expect(other.previousPlacements.size).toBe(0);
  });
});

describe("the previous placement of a deleted or renamed assembly", () => {
  it("drops the entry of a descendant of a deleted assembly", async () => {
    const { store } = openStore();
    await setPlacementField(store, typed, "250");
    const response = {
      pantin,
      retainedMeshFiles: [],
      deleted: {
        assembly: { key: "a", name: "A" },
        descendantAssemblies: [{ key: "block", name: "BLOCK" }],
        bodies: [],
        joints: [],
        drives: [],
        actuators: [],
        sensors: [],
      },
    } as unknown as AssemblyDeletionResponse;
    expect(withAssemblyContentsDeleted(store.state, response).previousPlacements.size).toBe(0);
  });

  it("is dropped with a deleted assembly and follows a renamed key", async () => {
    const { store } = openStore();
    await setPlacementField(store, typed, "250");
    const renamed = withPreviousPlacementKeyRenamed(store.state, "block", "bloc");
    expect([...renamed.previousPlacements.keys()]).toEqual(["bloc"]);
    const response = {
      pantin,
      retainedMeshFiles: [],
      deleted: {
        assembly: { key: "block", name: "BLOCK" },
        descendantAssemblies: [],
        bodies: [],
        joints: [],
        drives: [],
        actuators: [],
        sensors: [],
      },
    } as unknown as AssemblyDeletionResponse;
    expect(withAssemblyContentsDeleted(store.state, response).previousPlacements.size).toBe(0);
  });

  it("does nothing when the request fails", async () => {
    const { store } = openStore();
    store.ports.api.setAssemblyPlacement = vi.fn(async () => {
      throw new Error("refused");
    });
    await setPlacementField(store, typed, "250");
    expect(store.state.previousPlacements.size).toBe(0);
  });
});

describe("a rejected edit", () => {
  it("keeps nothing from a drag whose every value the core rejected", async () => {
    const { store } = openStore();
    store.ports.api.setAssemblyPlacement = vi.fn(async () => {
      throw new Error("refused");
    });
    const at: Placement = { translation: [0.2, 0, 0], rotation: [0, 0, 0, 1] };
    dragPlacement(store, "block", at);
    await finishPlacementDrag(store);
    expect(store.state.previousPlacements.size).toBe(0);
  });
});
