import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";

// Deleting a drive, an actuator or a sensor asks first, whatever the entry point.

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a")],
  joints: [jointOf("j1", "s1")],
  drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
  sensors: [encoderOf("e1", "a", "j1")],
});
const pantin = { id: "press", unsavedChanges: false, document };
const translate = createTranslator("fr");

function openStore(api: Partial<PantinApiClient>) {
  const store = testStore({
    getPantin: async () => pantin,
    getFaults: async () => ({ jammedJoints: [], unresponsiveDrives: [] }),
    ...api,
  });
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

describe("asking before deleting a device", () => {
  it.each([
    ["drive", "v2", "deleteDrive", "Supprimer le préactionneur « v2 » ?"],
    ["actuator", "c1", "deleteActuator", "Supprimer l'actionneur « c1 » ?"],
    ["sensor", "e1", "deleteSensor", "Supprimer le capteur « e1 » ?"],
  ] as const)("a %s: asks, deletes nothing until confirmed", async (_kind, id, call, text) => {
    const remove = vi.fn(async () => pantin);
    const store = openStore({ [call]: remove });
    const intents = createPanelIntents(store);
    intents[call](id);
    expect(buildPromptView(store.state, translate)?.text).toBe(text);
    expect(remove).not.toHaveBeenCalled();
    intents.resolvePrompt("confirmDelete");
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("press", id));
    expect(store.state.pendingDeleteDevice).toBeNull();
  });

  it.each([
    ["deleteDrive", "v2"],
    ["deleteActuator", "c1"],
    ["deleteSensor", "e1"],
  ] as const)("%s: cancelling deletes nothing and closes the question", (call, id) => {
    const remove = vi.fn(async () => pantin);
    const store = openStore({ [call]: remove });
    const intents = createPanelIntents(store);
    intents[call](id);
    intents.resolvePrompt("cancelDelete");
    expect(remove).not.toHaveBeenCalled();
    expect(buildPromptView(store.state, translate)).toBeNull();
  });

  it("says that a drive still feeding an actuator will be refused", () => {
    const store = openStore({});
    createPanelIntents(store).deleteDrive("v1");
    const view = buildPromptView(store.state, translate);
    expect(view?.details?.[0]).toContain("Il alimente encore : c1.");
  });

  it("asks nothing for a device that does not exist", () => {
    const store = openStore({});
    createPanelIntents(store).deleteSensor("ghost");
    expect(buildPromptView(store.state, translate)).toBeNull();
  });
});
