import type { CreateActuatorRequest, PantinResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { wiringDocument } from "../diagram/diagram-wiring-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildPromptView } from "../panel/prompt-model.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { testStore } from "./controller-test-helpers.ts";
import {
  cancelFeedReplacement,
  confirmFeedReplacement,
  createDiagramElement,
  linkDiagramNodes,
  removeDiagramLink,
  showDiagramHint,
} from "./diagram-edit-actions.ts";

const pantin: PantinResponse = { id: "press", unsavedChanges: false, document: wiringDocument };

// Records the updates the diagram sends; the core's answer is the same Pantin.
function openStore() {
  const updates: { actuatorId: string; request: CreateActuatorRequest }[] = [];
  const store = testStore({
    updateActuator: async (_pantinId, actuatorId, request) => {
      updates.push({ actuatorId, request });
      const found = wiringDocument.actuators.find((actuator) => actuator.id === actuatorId);
      if (found === undefined) {
        throw new Error(`No actuator ${actuatorId} in the test document.`);
      }
      return found;
    },
    getPantin: async () => pantin,
    listPantins: async () => [],
  });
  store.requestedPantinId = pantin.id;
  store.update({ ...withOpenPantin(store.state, pantin), drivePanelOpen: false });
  return { store, updates };
}

const output = (drive: string, port: string) => ({
  nodeId: `drive:${drive}`,
  socketId: `out:${port}`,
});
const input = (actuator: string, port: string) => ({
  nodeId: `actuator:${actuator}`,
  socketId: `in:${port}`,
});

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("linkDiagramNodes", () => {
  it("sends the update of a plain link and says so", async () => {
    const { store, updates } = openStore();
    linkDiagramNodes(store, output("v1", "port_2"), input("cyl2", "cap"));
    await settle();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.actuatorId).toBe("cyl2");
    expect(store.state.message?.key).toBe("message.actuatorUpdated");
  });

  it("sends nothing for a refused link and shows why on the message line", () => {
    const { store, updates } = openStore();
    linkDiagramNodes(store, output("sv", "out"), input("cyl1", "cap"));
    expect(updates).toHaveLength(0);
    expect(store.state.message).toMatchObject({ level: "error", key: "diagram.refusal.domain" });
  });

  it("holds a link that replaces a whole feed until the user confirms", async () => {
    const { store, updates } = openStore();
    linkDiagramNodes(store, output("v2", "port_2"), input("cyl1", "cap"));
    expect(updates).toHaveLength(0);
    expect(store.state.pendingFeedReplacement?.replaced.toDrive).toBe("v2");
    const prompt = buildPromptView(store.state, createTranslator("en"));
    expect(prompt?.actions.map((entry) => entry.action)).toEqual([
      "confirmReplaceFeed",
      "cancelReplaceFeed",
    ]);
    confirmFeedReplacement(store);
    await settle();
    expect(store.state.pendingFeedReplacement).toBeNull();
    expect(updates[0]?.request.feed?.drive).toBe("v2");
  });

  it("drops the held link when the user cancels", () => {
    const { store, updates } = openStore();
    linkDiagramNodes(store, output("v2", "port_2"), input("cyl1", "cap"));
    cancelFeedReplacement(store);
    expect(store.state.pendingFeedReplacement).toBeNull();
    expect(updates).toHaveLength(0);
  });
});

describe("removeDiagramLink", () => {
  it("removes an actuator's whole feed", async () => {
    const { store, updates } = openStore();
    removeDiagramLink(store, "drive:v1", "actuator:cyl1");
    await settle();
    expect(updates[0]?.request.feed).toBeUndefined();
  });

  it("explains why a sensor's link stays", () => {
    const { store, updates } = openStore();
    removeDiagramLink(store, "joint:j1", "sensor:e1");
    expect(updates).toHaveLength(0);
    expect(store.state.message?.key).toBe("diagram.refusal.sensorNeedsJoint");
  });
});

describe("hints and the creation forms of the column heads", () => {
  it("shows a hint as an information message", () => {
    const { store } = openStore();
    showDiagramHint(store, "diagram.hint.noLinkChoices");
    expect(store.state.message).toMatchObject({ level: "info", key: "diagram.hint.noLinkChoices" });
  });

  it("opens the panel on the form of the column's element", () => {
    const { store } = openStore();
    createDiagramElement(store, "actuator");
    expect(store.state.drivePanelOpen).toBe(true);
    expect(store.state.actuatorForm?.actuatorId).toBeNull();
    createDiagramElement(store, "drive");
    expect(store.state.driveForm).not.toBeNull();
    createDiagramElement(store, "sensor");
    expect(store.state.sensorForm?.sensorId).toBeNull();
  });
});

describe("edits while another is in flight", () => {
  it("waits, with a hint, instead of building from the old document", () => {
    const { store, updates } = openStore();
    store.update({ ...store.state, pendingRequestCount: 1 });
    linkDiagramNodes(store, output("v1", "port_2"), input("cyl2", "cap"));
    removeDiagramLink(store, "drive:v1", "actuator:cyl1");
    expect(updates).toHaveLength(0);
    expect(store.state.message?.key).toBe("diagram.hint.busy");
  });
});

describe("the feed prompt", () => {
  it("replaces a delete prompt instead of piling up with it", () => {
    const { store } = openStore();
    store.update({ ...store.state, pendingDeleteJointId: "j1" });
    linkDiagramNodes(store, output("v2", "port_2"), input("cyl1", "cap"));
    expect(store.state.pendingDeleteJointId).toBeNull();
    expect(store.state.pendingFeedReplacement).not.toBeNull();
  });

  it("shows the refusal when the link no longer holds at confirm time", () => {
    const { store, updates } = openStore();
    // A held link whose drive does not exist any more in the document.
    store.update({
      ...store.state,
      pendingFeedReplacement: {
        from: output("gone", "port_2"),
        to: input("cyl1", "cap"),
        replaced: { actuatorName: "cyl1", fromDrive: "v1", toDrive: "gone" },
      },
    });
    confirmFeedReplacement(store);
    expect(updates).toHaveLength(0);
    expect(store.state.message).toMatchObject({
      level: "error",
      key: "diagram.refusal.notLinkable",
    });
  });
});
