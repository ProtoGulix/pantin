import type { AssemblyDeletion, AssemblyDeletionResponse, PantinResponse } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { newAlignmentSession } from "../alignment/alignment-session.ts";
import { PantinApiError } from "../api-transport.ts";
import { NO_ASSEMBLY_DISPLAY } from "../assembly-display.ts";
import { createTranslator } from "../i18n/translate.ts";
import { initialJointForm } from "../joints/joint-form.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { pantinResponse, railBody, stepBody } from "../test-fixtures.ts";
import { assemblyNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import { requestDelete, resolvePrompt } from "./session-actions.ts";

// Deleting an assembly from the tree (ADR 0037 point 7).

const document = pantinResponse(true, [railBody, stepBody("rod", "Tige")]).document;
const pantin: PantinResponse = {
  id: "press",
  unsavedChanges: true,
  document: {
    ...document,
    assemblies: [
      ...document.assemblies,
      { key: "empty", name: "Vide", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    ],
  },
};
const afterwards: PantinResponse = {
  ...pantin,
  document: { ...pantin.document, bodies: [], assemblies: pantin.document.assemblies.slice(1) },
};

const deletion: AssemblyDeletion = {
  assembly: { key: "main", name: "main" },
  bodies: [
    { id: "rail", name: "Linear rail" },
    { id: "rod", name: "Tige" },
  ],
  joints: [{ id: "j1", name: "Fixation", betweenAssemblies: false }],
  drives: [{ id: "d1", name: "Distributeur" }],
  actuators: [{ id: "a1", name: "Vérin" }],
  sensors: [{ id: "s1", name: "Capteur fin" }],
  reanchoredAssemblies: [{ key: "pince", name: "Pince" }],
  removedTags: ["main.j1.setpoint"],
  addedTags: ["pince.tige.setpoint"],
};
const answer = (retainedMeshFiles: string[] = []): AssemblyDeletionResponse => ({
  pantin: afterwards,
  deleted: deletion,
  retainedMeshFiles,
});

function openStore(api: Parameters<typeof testStore>[0]) {
  const store = testStore({
    getPantin: async () => afterwards,
    listPantins: async () => [],
    ...api,
  });
  store.requestedPantinId = "press";
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

describe("requestDelete on an assembly", () => {
  it("deletes an empty assembly at once and never asks for the preview", async () => {
    const previewAssemblyDeletion = vi.fn();
    const deleteAssembly = vi.fn(async () => afterwards);
    const store = openStore({ previewAssemblyDeletion, deleteAssembly });
    requestDelete(store, assemblyNodeId("press", "empty"));
    await vi.waitFor(() => expect(deleteAssembly).toHaveBeenCalledWith("press", "empty"));
    expect(previewAssemblyDeletion).not.toHaveBeenCalled();
    expect(store.state.pendingDeleteAssembly).toBeNull();
  });

  it("asks the preview for a non-empty one and opens the prompt with names only", async () => {
    const previewAssemblyDeletion = vi.fn(async () => deletion);
    const store = openStore({ previewAssemblyDeletion });
    requestDelete(store, assemblyNodeId("press", "main"));
    await vi.waitFor(() => expect(store.state.pendingDeleteAssembly).not.toBeNull());
    const view = buildPromptView(store.state, createTranslator("fr"));
    expect(view?.text).toContain("tout son contenu");
    expect(view?.details?.join("\n")).toContain("Linear rail");
    expect(previewAssemblyDeletion).toHaveBeenCalledWith("press", "main");
  });

  it("shows the core's refusal on the message line and opens no prompt", async () => {
    const message = 'Actuator "Vérin pince" of assembly "Pince" moves joint "Tige".';
    const previewAssemblyDeletion = vi.fn(async () => {
      throw new PantinApiError("api", message, "conflict", 409);
    });
    const store = openStore({ previewAssemblyDeletion });
    requestDelete(store, assemblyNodeId("press", "main"));
    await vi.waitFor(() => expect(store.state.message).not.toBeNull());
    expect(store.state.message?.level).toBe("error");
    expect(store.state.message?.detail).toBe(message);
    expect(store.state.pendingDeleteAssembly).toBeNull();
  });
});

async function askedStore(api: Parameters<typeof testStore>[0]) {
  const store = openStore({ previewAssemblyDeletion: async () => deletion, ...api });
  requestDelete(store, assemblyNodeId("press", "main"));
  await vi.waitFor(() => expect(store.state.pendingDeleteAssembly).not.toBeNull());
  return store;
}

describe("the assembly deletion prompt", () => {
  it("is cleared by cancel", async () => {
    const store = await askedStore({});
    resolvePrompt(store, "cancelDelete");
    expect(store.state.pendingDeleteAssembly).toBeNull();
  });

  it("sends contents=delete on confirm, then selects the Pantin and drops what went", async () => {
    const deleteAssemblyWithContents = vi.fn(async () => answer());
    const store = await askedStore({ deleteAssemblyWithContents });
    const jointForm = { ...initialJointForm(pantin.document.bodies), jointId: "j1" };
    store.update({
      ...store.state,
      alignment: newAlignmentSession("press", "main"),
      jointForm,
      driveForm: { driveId: "d1", type: "valve_5_3_closed", name: "", assembly: "x", values: {} },
      assemblyDisplay: { hiddenAssemblyKeys: new Set(["main"]), isolatedAssemblyKey: "main" },
    });
    resolvePrompt(store, "confirmDelete");
    await vi.waitFor(() =>
      expect(store.state.message?.key).toBe("message.assemblyContentsDeleted"),
    );
    expect(deleteAssemblyWithContents).toHaveBeenCalledWith("press", "main");
    const state = store.state;
    expect(selectedNodeIdOf(state.selection)).toBe(pantinNodeId("press"));
    expect(state.pendingDeleteAssembly).toBeNull();
    expect(state.assemblyDisplay).toEqual(NO_ASSEMBLY_DISPLAY);
    expect(state.alignment).toBeNull();
    expect(state.jointForm).toBeNull();
    expect(state.driveForm).toBeNull();
    expect(state.openPantin?.document.bodies).toEqual([]);
  });

  it("warns when files stay for the next save", async () => {
    const files = ["meshes/rod.glb"];
    const store = await askedStore({ deleteAssemblyWithContents: async () => answer(files) });
    resolvePrompt(store, "confirmDelete");
    await vi.waitFor(() =>
      expect(store.state.message?.key).toBe("message.assemblyContentsDeletedRetained"),
    );
    expect(store.state.message?.parameters).toMatchObject({ count: 1 });
  });
});

describe("the assembly deletion prompt, other sessions", () => {
  it("keeps an alignment and a form that the deleted assembly does not concern", async () => {
    const store = await askedStore({ deleteAssemblyWithContents: async () => answer() });
    const alignment = newAlignmentSession("press", "other");
    store.update({
      ...store.state,
      alignment,
      sensorForm: {
        sensorId: "s9",
        type: "position_switch",
        name: "",
        assembly: "o",
        joint: "",
        values: {},
      },
    });
    resolvePrompt(store, "confirmDelete");
    await vi.waitFor(() =>
      expect(store.state.message?.key).toBe("message.assemblyContentsDeleted"),
    );
    expect(store.state.alignment).toBe(alignment);
    expect(store.state.sensorForm?.sensorId).toBe("s9");
  });
});

const servo = {
  id: "sv",
  tagKey: "sv",
  name: "Servo",
  assembly: "empty",
  type: "servo_drive" as const,
  maxSpeed: 1,
  maxAcceleration: 1,
};

describe("assemblies that hold something other than a body", () => {
  it("sends an assembly holding only a drive to the preview, not to the immediate delete", async () => {
    const previewAssemblyDeletion = vi.fn(async () => ({
      ...deletion,
      assembly: { key: "empty", name: "Vide" },
    }));
    const deleteAssembly = vi.fn();
    const store = openStore({ previewAssemblyDeletion, deleteAssembly });
    store.state = withOpenPantin(store.state, {
      ...pantin,
      document: { ...pantin.document, drives: [servo] },
    });
    requestDelete(store, assemblyNodeId("press", "empty"));
    await vi.waitFor(() => expect(previewAssemblyDeletion).toHaveBeenCalledWith("press", "empty"));
    expect(deleteAssembly).not.toHaveBeenCalled();
  });
});

describe("the prompt when the document changes under it", () => {
  it("is hidden once the assembly is gone, and a confirm then sends nothing", async () => {
    const deleteAssemblyWithContents = vi.fn(async () => answer());
    const store = await askedStore({ deleteAssemblyWithContents });
    expect(buildPromptView(store.state, createTranslator("fr"))).not.toBeNull();
    store.state = withOpenPantin(store.state, afterwards);
    expect(buildPromptView(store.state, createTranslator("fr"))).toBeNull();
    resolvePrompt(store, "confirmDelete");
    await Promise.resolve();
    expect(deleteAssemblyWithContents).not.toHaveBeenCalled();
  });

  it("shows the message of a failed confirm and keeps the Pantin as it was", async () => {
    const failing = async () => {
      throw new PantinApiError("api", "Assembly not found.", "not_found", 404);
    };
    const store = await askedStore({ deleteAssemblyWithContents: failing });
    resolvePrompt(store, "confirmDelete");
    await vi.waitFor(() => expect(store.state.message?.level).toBe("error"));
    expect(store.state.message?.detail).toBe("Assembly not found.");
    expect(store.state.openPantin?.document.bodies).toHaveLength(2);
  });
});

describe("forms on removed items", () => {
  it.each(["parent", "child"])("closes a new-joint form whose %s body was removed", async (end) => {
    const store = await askedStore({ deleteAssemblyWithContents: async () => answer() });
    const form = initialJointForm(pantin.document.bodies);
    const values = {
      ...form.values,
      [end]: "rod",
      [end === "parent" ? "child" : "parent"]: "other",
    };
    store.update({ ...store.state, jointForm: { ...form, values } });
    resolvePrompt(store, "confirmDelete");
    await vi.waitFor(() =>
      expect(store.state.message?.key).toBe("message.assemblyContentsDeleted"),
    );
    expect(store.state.jointForm).toBeNull();
  });
});
