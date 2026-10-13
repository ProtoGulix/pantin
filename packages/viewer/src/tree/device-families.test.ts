import { describe, expect, it } from "vitest";
import { DEVICE_KINDS } from "../device-selection.ts";
import {
  assemblyOfDevice,
  DEVICE_FAMILIES,
  deviceEntry,
  familyDevices,
  familyOfKind,
} from "./device-families.ts";
import { devicePantin } from "./device-fixtures.ts";

const { document } = devicePantin();
const context = { document, language: "en" } as const;

function detailsOf(kind: (typeof DEVICE_KINDS)[number]): (string | null)[] {
  return deviceEntry(kind)
    .items(context, "main")
    .map((item) => item.detail);
}

describe("the device registry (ADR 0047 point 6)", () => {
  it("has an entry for every kind of device, in exactly one family", () => {
    for (const kind of DEVICE_KINDS) {
      expect(deviceEntry(kind).icon, kind).toBeTruthy();
      expect(
        DEVICE_FAMILIES.filter((family) => family.kinds.includes(kind)),
        kind,
      ).toHaveLength(1);
      expect(familyOfKind(kind), kind).toBeDefined();
    }
  });

  it("lists the families in the order of the ADR", () => {
    expect(DEVICE_FAMILIES.map((family) => [family.key, family.kinds])).toEqual([
      ["actionChain", ["drive", "actuator", "sensor"]],
      ["conveying", ["belt", "guide", "presenceSensor"]],
      ["productFlow", ["emitter", "absorber"]],
    ]);
  });

  it("shows the type label of a drive, an actuator, a sensor and a presence sensor", () => {
    expect(detailsOf("drive")[0]).toBeTruthy();
    expect(detailsOf("actuator")[0]).toBeTruthy();
    expect(detailsOf("sensor")[0]).toBeTruthy();
    expect(detailsOf("presenceSensor")[0]).toBeTruthy();
  });

  it("shows sizes in millimetres, and the body an object is placed on", () => {
    expect(detailsOf("belt")).toEqual(["1000 × 300 mm"]);
    expect(detailsOf("guide")).toEqual(["1000 × 20 × 60 mm"]);
    expect(detailsOf("emitter")).toEqual(["200 × 150 × 100 mm · Linear rail"]);
    expect(detailsOf("absorber")).toEqual(["200 × 300 × 100 mm"]);
  });

  it("lists each kind in turn, then the document order, for one assembly only", () => {
    const conveying = DEVICE_FAMILIES.find((family) => family.key === "conveying");
    if (conveying === undefined) {
      throw new Error("expected the conveying family");
    }
    expect(familyDevices(context, conveying, "main").map((item) => item.kind)).toEqual([
      "belt",
      "guide",
      "presenceSensor",
    ]);
    expect(familyDevices(context, conveying, "other")).toEqual([]);
  });

  it("finds the assembly of a device, or none for a device that is gone", () => {
    expect(assemblyOfDevice(document, "guide", "side")).toBe("main");
    expect(assemblyOfDevice(document, "guide", "gone")).toBeUndefined();
  });
});
