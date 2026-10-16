import { describe, expect, it } from "vitest";
import { DEVICE_KINDS } from "../device-selection.ts";
import { assemblyNodeId, deviceRowId, FAMILY_KEYS, familyNodeId, parseNodeId } from "./node-ids.ts";

describe("family and device ids (ADR 0047)", () => {
  it("round-trips a family folder", () => {
    for (const family of FAMILY_KEYS) {
      expect(parseNodeId(familyNodeId("press", "main", family))).toEqual({
        kind: "family",
        pantinId: "press",
        assemblyKey: "main",
        family,
      });
    }
    expect(familyNodeId("press", "main", "actionChain")).toBe("family:press:main:actionChain");
  });

  it("round-trips a device row of every kind", () => {
    for (const kind of DEVICE_KINDS) {
      expect(parseNodeId(deviceRowId("press", kind, "d1"))).toEqual({
        kind: "device",
        pantinId: "press",
        deviceKind: kind,
        id: "d1",
      });
    }
    expect(deviceRowId("press", "presenceSensor", "cell")).toBe("device:press:presenceSensor:cell");
  });

  it("refuses unknown families and device kinds, and incomplete ids", () => {
    expect(parseNodeId("family:press:main:flow")).toBeNull();
    expect(parseNodeId("family:press:main")).toBeNull();
    expect(parseNodeId("device:press:robot:r1")).toBeNull();
    expect(parseNodeId("device:press:drive")).toBeNull();
    expect(parseNodeId("device:press:drive:d1:extra")).toBeNull();
  });

  it("keeps the ids of the other nodes", () => {
    expect(parseNodeId(assemblyNodeId("press", "main"))).toEqual({
      kind: "assembly",
      pantinId: "press",
      key: "main",
    });
  });
});
