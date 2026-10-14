import { describe, expect, it } from "vitest";
import { jointNodeId } from "../tree/node-ids.ts";
import { ownerOfDevice, ownerOfSelection, targetOfOwner } from "./io-owner.ts";

describe("owner and selection", () => {
  it("turns a joint owner into a joint and a device owner into a device", () => {
    expect(targetOfOwner({ kind: "joint", id: "j1" })).toEqual({ kind: "joint", jointId: "j1" });
    expect(targetOfOwner({ kind: "presenceSensor", id: "p1" })).toEqual({
      kind: "device",
      device: { kind: "presenceSensor", id: "p1" },
    });
    expect(targetOfOwner({ kind: "emitter", id: "e1" }).kind).toBe("device");
  });

  it("gives an owner to the devices that own tags only", () => {
    expect(ownerOfDevice({ kind: "drive", id: "d" })).toEqual({ kind: "drive", id: "d" });
    expect(ownerOfDevice({ kind: "actuator", id: "a" })).toBeNull();
    expect(ownerOfDevice({ kind: "belt", id: "b" })).toBeNull();
  });

  it("reads the owner of a selected device or joint node", () => {
    expect(ownerOfSelection({ kind: "sensor", id: "s" })).toEqual({ kind: "sensor", id: "s" });
    expect(ownerOfSelection({ kind: "node", nodeId: jointNodeId("p", "j1", "body") })).toEqual({
      kind: "joint",
      id: "j1",
    });
    expect(ownerOfSelection({ kind: "node", nodeId: "pantin:p" })).toBeNull();
    expect(ownerOfSelection(null)).toBeNull();
  });
});
