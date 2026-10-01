import type {
  CreateActuatorRequest,
  CreateDriveRequest,
  CreateSensorRequest,
} from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import type { PantinApiClient } from "../api-client.ts";
import {
  actuatorOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { runForcing, submitForcedValue } from "../ui/diagram-forcing.ts";
import { applyToggle } from "../ui/row-actions.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { createPanelIntents } from "./controller.ts";
import { testStore } from "./controller-test-helpers.ts";
import { commitDeviceEdit } from "./device-edit-actions.ts";
import { refreshTagValues } from "./drive-commands.ts";

// The inspector's edits and commands (ADR 0030): a field committed in the
// grid goes through the device's own request builder and API call; toggles
// and forcing go through the same intents as the former panel.

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2")],
  drives: [
    driveOf("v1", "a"),
    { ...driveOf("inv", "a", "vfd_analog"), acceleration: 50 },
    { ...driveOf("sv", "a", "servo_drive"), maxSpeed: 1, maxAcceleration: 1 },
  ],
  actuators: [
    cylinderOf("c1", "a", "v1", ["j1"]),
    actuatorOf("m1", "a", { type: "servo_motor" }, { drive: "sv", ports: { in: "out" } }, ["j2"]),
  ],
  sensors: [encoderOf("e1", "a", "j1")],
});
const pantin = { id: "press", unsavedChanges: false, document };

function openStore(api: Partial<PantinApiClient>) {
  const store = testStore({ getPantin: async () => pantin, listPantins: async () => [], ...api });
  store.requestedPantinId = pantin.id;
  store.state = withOpenPantin(store.state, pantin);
  return store;
}

const edit = (kind: "drive" | "actuator" | "sensor", id: string, fieldId: string) =>
  ({ kind: "deviceField", device: { kind, id }, fieldId }) as const;

describe("commitDeviceEdit", () => {
  it("renames a drive through the drive update, keeping its other fields", async () => {
    const updateDrive = vi.fn(
      async (_id: string, _driveId: string, request: CreateDriveRequest) => ({
        id: "inv",
        tagKey: "inv",
        ...request,
      }),
    );
    const store = openStore({ updateDrive });
    await commitDeviceEdit(store, edit("drive", "inv", "name"), "Inverter");
    expect(updateDrive).toHaveBeenCalledWith("press", "inv", {
      type: "vfd_analog",
      name: "Inverter",
      assembly: "a",
      acceleration: 50,
    });
    expect(store.state.message?.level).toBe("info");
  });

  it("sends an actuator parameter typed in mm per second as metres", async () => {
    const updateActuator = vi.fn(
      async (_id: string, _actuatorId: string, request: CreateActuatorRequest) => ({
        id: "c1",
        ...request,
      }),
    );
    const store = openStore({ updateActuator });
    await commitDeviceEdit(store, edit("actuator", "c1", "extendSpeed"), "250");
    expect(updateActuator.mock.calls[0]?.[2]).toMatchObject({
      extendSpeed: 0.25,
      retractSpeed: 0.2,
    });
  });

  it("sends a sensor parameter, and keeps the form's validation: an invalid one is a message", async () => {
    const updateSensor = vi.fn(
      async (_id: string, _sensorId: string, request: CreateSensorRequest) => ({
        id: "e1",
        tagKey: "e1",
        ...request,
      }),
    );
    const store = openStore({ updateSensor });
    await commitDeviceEdit(store, edit("sensor", "e1", "pulsesPerUnit"), "2");
    expect(updateSensor.mock.calls[0]?.[2]).toMatchObject({ pulsesPerUnit: 2000 });
    await commitDeviceEdit(store, edit("sensor", "e1", "pulsesPerUnit"), "abc");
    expect(updateSensor).toHaveBeenCalledTimes(1);
    expect(store.state.message).toMatchObject({ level: "error", key: "message.sensorInvalid" });
  });
});

describe("commitDeviceEdit, other cases", () => {
  it("does nothing for a device that is gone", async () => {
    const updateDrive = vi.fn();
    const store = openStore({ updateDrive });
    await commitDeviceEdit(store, edit("drive", "ghost", "name"), "x");
    expect(updateDrive).not.toHaveBeenCalled();
  });
});

function commandStore() {
  const writeTag = vi.fn(async (_id: string, name: string, value: number) => ({
    name,
    type: "bit" as const,
    direction: "command" as const,
    value,
  }));
  const setDriveFault = vi.fn(async () => ({ jammedJoints: [], unresponsiveDrives: ["v1"] }));
  const setJointFault = vi.fn(async () => ({ jammedJoints: ["j1"], unresponsiveDrives: [] }));
  const store = openStore({
    writeTag,
    setDriveFault,
    setJointFault,
    listTags: async () => ({
      stepCount: 0,
      tags: [
        { name: "a.v1.coil_14", type: "bit" as const, direction: "command" as const, value: 0 },
      ],
      drives: [],
    }),
  });
  return { store, intents: createPanelIntents(store), writeTag, setDriveFault, setJointFault };
}

describe("the inspector's commands", () => {
  it("forces a bit tag from the toggle, as the former panel did", async () => {
    const { store, intents, writeTag } = commandStore();
    await refreshTagValues(store);
    applyToggle({ kind: "bitTag", tag: "a.v1.coil_14" }, false, intents);
    await vi.waitFor(() => expect(writeTag).toHaveBeenCalledWith("press", "a.v1.coil_14", 1));
  });

  it("sets the unresponsive fault of a drive and the jammed fault of a joint", async () => {
    const { store, intents, setDriveFault, setJointFault } = commandStore();
    applyToggle({ kind: "driveUnresponsive", driveId: "v1" }, false, intents);
    applyToggle({ kind: "jointJammed", jointId: "j1" }, false, intents);
    await vi.waitFor(() => expect(setJointFault).toHaveBeenCalledWith("press", "j1", "jammed"));
    expect(setDriveFault).toHaveBeenCalledWith("press", "v1", "unresponsive");
    expect(store.state.faults.jammedJoints).toEqual(["j1"]);
  });

  it("sends a joint's setpoint typed in mm as metres", async () => {
    const { intents, writeTag } = commandStore();
    intents.writeFloatTag("a.j2.setpoint", "40");
    await vi.waitFor(() => expect(writeTag).toHaveBeenCalledWith("press", "a.j2.setpoint", 0.04));
  });
});

describe("forcing from the diagram (ADR 0030 point 3)", () => {
  it("forces from the diagram through the same tag writes, a number converted to SI", async () => {
    const { store, intents, writeTag } = commandStore();
    await refreshTagValues(store);
    const openValueInput = vi.fn();
    const element = {} as Element; // only handed back to openValueInput
    runForcing({ kind: "toggle", tag: "a.v1.coil_14" }, element, { intents, openValueInput });
    await vi.waitFor(() => expect(writeTag).toHaveBeenCalledWith("press", "a.v1.coil_14", 1));
    expect(submitForcedValue("a.sv.setpoint", "40", intents)).toBe(true);
    await vi.waitFor(() => expect(writeTag).toHaveBeenCalledWith("press", "a.sv.setpoint", 0.04));
    // A percent has no conversion.
    submitForcedValue("a.inv.speed_setpoint", "60", intents);
    await vi.waitFor(() =>
      expect(writeTag).toHaveBeenCalledWith("press", "a.inv.speed_setpoint", 60),
    );
  });

  it("forcing from the diagram does not change the selection", async () => {
    const { store, intents } = commandStore();
    const before = selectedNodeIdOf(store.state.selection);
    const element = {} as Element; // only handed back to openValueInput
    runForcing({ kind: "toggle", tag: "a.v1.coil_14" }, element, {
      intents,
      openValueInput: vi.fn(),
    });
    submitForcedValue("a.sv.setpoint", "40", intents);
    await Promise.resolve();
    expect(selectedNodeIdOf(store.state.selection)).toBe(before);
    expect(selectedDeviceOf(store.state.selection)).toBeNull();
  });
});

describe("selecting a device from an index line", () => {
  it("selects the device and no tree row, and ignores one that is gone", () => {
    const store = openStore({});
    const intents = createPanelIntents(store);
    intents.selectDevice({ kind: "sensor", id: "e1" });
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "sensor", id: "e1" });
    expect(selectedNodeIdOf(store.state.selection)).toBeNull();
    intents.selectDevice({ kind: "sensor", id: "ghost" });
    expect(selectedDeviceOf(store.state.selection)).toEqual({ kind: "sensor", id: "e1" });
  });
});

describe("deleting a device from the inspector", () => {
  it("calls the delete of its kind and moves the selection to the Pantin", async () => {
    const without = { ...pantin, document: { ...document, sensors: [] } };
    const deleteSensor = vi.fn(async () => without);
    const store = openStore({
      deleteSensor,
      getPantin: async () => without,
      getFaults: async () => store.state.faults,
    });
    const intents = createPanelIntents(store);
    intents.selectDevice({ kind: "sensor", id: "e1" });
    intents.deleteSensor("e1");
    await vi.waitFor(() => expect(selectedDeviceOf(store.state.selection)).toBeNull());
    expect(deleteSensor).toHaveBeenCalledWith("press", "e1");
  });
});
