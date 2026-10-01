import { describe, expect, it, vi } from "vitest";
import { applyToggle, deleteDevice, editDevice, followLink } from "./row-actions.ts";

// What the controls of a grid row raise, as intents.

function toggleIntents() {
  return { toggleBitTag: vi.fn(), setDriveUnresponsive: vi.fn(), setJointJammed: vi.fn() };
}

describe("applyToggle", () => {
  it("forces a bit tag from what the core last reported", () => {
    const intents = toggleIntents();
    applyToggle({ kind: "bitTag", tag: "a.v1.coil_14" }, false, intents);
    expect(intents.toggleBitTag).toHaveBeenCalledWith("a.v1.coil_14");
  });

  it("sets a fault to the opposite of what the toggle shows", () => {
    const intents = toggleIntents();
    applyToggle({ kind: "driveUnresponsive", driveId: "v1" }, false, intents);
    applyToggle({ kind: "driveUnresponsive", driveId: "v1" }, true, intents);
    applyToggle({ kind: "jointJammed", jointId: "j1" }, false, intents);
    expect(intents.setDriveUnresponsive.mock.calls).toEqual([
      ["v1", true],
      ["v1", false],
    ]);
    expect(intents.setJointJammed.mock.calls).toEqual([["j1", true]]);
  });
});

describe("followLink", () => {
  it("selects the device of a device link, and reveals the node of a node link", () => {
    const intents = { revealNode: vi.fn(), selectDevice: vi.fn() };
    followLink({ kind: "device", device: { kind: "sensor", id: "e1" } }, intents);
    followLink({ kind: "node", nodeId: "joint:press:j1" }, intents);
    expect(intents.selectDevice).toHaveBeenCalledWith({ kind: "sensor", id: "e1" });
    expect(intents.revealNode).toHaveBeenCalledWith("joint:press:j1");
  });
});

describe("the device buttons", () => {
  const intents = {
    openDriveForm: vi.fn(),
    openActuatorForm: vi.fn(),
    openSensorForm: vi.fn(),
    deleteDrive: vi.fn(),
    deleteActuator: vi.fn(),
    deleteSensor: vi.fn(),
  };

  it("edit and delete the device through the call of its kind", () => {
    editDevice({ kind: "actuator", id: "c1" }, intents);
    deleteDevice({ kind: "drive", id: "v1" }, intents);
    deleteDevice({ kind: "sensor", id: "e1" }, intents);
    expect(intents.openActuatorForm).toHaveBeenCalledWith("c1");
    expect(intents.deleteDrive).toHaveBeenCalledWith("v1");
    expect(intents.deleteSensor).toHaveBeenCalledWith("e1");
    expect(intents.deleteActuator).not.toHaveBeenCalled();
    expect(intents.openDriveForm).not.toHaveBeenCalled();
  });
});
