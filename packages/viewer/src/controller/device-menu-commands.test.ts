import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import { PantinApiError } from "../api-transport.ts";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildInspectorView } from "../inspector/inspector-model.ts";
import { withSelectedDevice } from "../tree/tree-state.ts";
import { buildPanelView } from "../view-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { runMenuCommand } from "./menu-commands.ts";

// The Édition menu on a selected device (ADR 0030 point 4).

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2")],
  drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"]), cylinderOf("c2", "a", "v1", ["j2"])],
  sensors: [encoderOf("e1", "a", "j1")],
});
const pantin = { id: "press", unsavedChanges: false, document };
const ignoreLanguage = () => undefined;

function openStore(api: Partial<PantinApiClient> = {}) {
  const store = testStore({
    getPantin: async () => pantin,
    listPantins: async () => [],
    getFaults: async () => ({ jammedJoints: [], unresponsiveDrives: [] }),
    ...api,
  });
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Supprimer on a selected device", () => {
  it.each([
    ["drive", "v2", "deleteDrive", "message.driveDeleted"],
    ["actuator", "c1", "deleteActuator", "message.actuatorDeleted"],
    ["sensor", "e1", "deleteSensor", "message.sensorDeleted"],
  ] as const)(
    "deletes a %s with the API call of the inspector's button",
    async (kind, id, call, done) => {
      const remove = vi.fn(async () => pantin);
      const store = openStore({ [call]: remove });
      store.update(withSelectedDevice(store.state, { kind, id }));
      runMenuCommand(store, "delete", ignoreLanguage);
      await settle();
      expect(remove).toHaveBeenCalledWith("press", id);
      expect(store.state.message?.key).toBe(done);
    },
  );
});

describe("a refused drive deletion", () => {
  function refusedStore() {
    const store = openStore({
      deleteDrive: async () => {
        throw new PantinApiError("api", 'Drive "v1" feeds actuator "c1", "c2".', "conflict", 409);
      },
    });
    store.update(withSelectedDevice(store.state, { kind: "drive", id: "v1" }));
    runMenuCommand(store, "delete", ignoreLanguage);
    return store;
  }

  it("names the actuators to detach first, found in the document", async () => {
    const store = refusedStore();
    await settle();
    const view = buildPanelView(store.state);
    expect(view.message?.text).toBe(
      "Le préactionneur « v1 » alimente encore des actionneurs. Détachez-les d'abord :",
    );
    expect(view.message?.links).toEqual([
      { label: "c1", device: { kind: "actuator", id: "c1" } },
      { label: "c2", device: { kind: "actuator", id: "c2" } },
    ]);
    expect(store.state.message?.key).toBe("message.driveInUse");
    expect(view.message?.detail).toBe('Drive "v1" feeds actuator "c1", "c2".');
  });

  it("selects an actuator when its link is followed", async () => {
    const store = refusedStore();
    await settle();
    const [first] = buildPanelView(store.state).message?.links ?? [];
    if (first === undefined) {
      throw new Error("The message has no link.");
    }
    createPanelIntents(store).selectDevice(first.device);
    expect(store.state.selectedDevice).toEqual({ kind: "actuator", id: "c1" });
  });

  it("keeps the generic message when the failure is not a conflict", async () => {
    const store = openStore({
      deleteDrive: async () => {
        throw new PantinApiError("network", "down", null, null);
      },
    });
    store.update(withSelectedDevice(store.state, { kind: "drive", id: "v1" }));
    runMenuCommand(store, "delete", ignoreLanguage);
    await settle();
    expect(store.state.message?.key).toBe("error.network");
  });
});

describe("Renommer on a selected device", () => {
  const t = createTranslator("en");

  it("asks the inspector to focus the name field, once per press", () => {
    const store = openStore();
    store.update(withSelectedDevice(store.state, { kind: "sensor", id: "e1" }));
    runMenuCommand(store, "rename", ignoreLanguage);
    const first = buildInspectorView(store.state, t).focusRequest;
    expect(first).toMatchObject({ key: "property-name" });
    runMenuCommand(store, "rename", ignoreLanguage);
    expect(buildInspectorView(store.state, t).focusRequest?.serial).toBe((first?.serial ?? 0) + 1);
    expect(store.state.renamingNodeId).toBeNull();
  });

  it("opens the inspector and unfolds the group holding the name", () => {
    const store = openStore();
    store.update({
      ...withSelectedDevice(store.state, { kind: "drive", id: "v2" }),
      inspectorOpen: false,
      collapsedPropertyGroups: new Set(["general", "parameters"]),
    });
    runMenuCommand(store, "rename", ignoreLanguage);
    expect(store.state.inspectorOpen).toBe(true);
    expect([...store.state.collapsedPropertyGroups]).toEqual(["parameters"]);
  });

  it("serves a F2 on a diagram node: selects the node's device, then focuses the name", () => {
    // The diagram's F2 handler calls these two intents, in this order.
    const store = openStore();
    const intents = createPanelIntents(store);
    intents.selectDiagramNode("actuator:c2");
    intents.runMenuCommand("rename");
    expect(store.state.selectedDevice).toEqual({ kind: "actuator", id: "c2" });
    expect(store.state.inspectorFocus).toMatchObject({ key: "property-name" });
  });

  it("still renames a body in the tree", () => {
    const store = openStore();
    runMenuCommand(store, "rename", ignoreLanguage);
    expect(store.state.renamingNodeId).not.toBeNull();
    expect(store.state.inspectorFocus).toBeNull();
  });
});
