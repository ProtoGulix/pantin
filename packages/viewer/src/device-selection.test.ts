import { describe, expect, it } from "vitest";
import {
  deviceExists,
  deviceName,
  deviceNodeId,
  deviceOfDiagramNode,
  relatedJointIds,
} from "./device-selection.ts";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram/diagram-fixtures.ts";

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a")],
  joints: [jointOf("j1", "s1"), jointOf("j2", "s2")],
  drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"]), cylinderOf("c2", "a", "v1", ["j2"])],
  sensors: [encoderOf("e1", "a", "j2")],
});

describe("diagram node ids of devices", () => {
  it("round-trips a device, and refuses a joint or a malformed id", () => {
    for (const kind of ["drive", "actuator", "sensor"] as const) {
      const device = { kind, id: "x:y" };
      expect(deviceOfDiagramNode(deviceNodeId(device))).toEqual(device);
    }
    expect(deviceOfDiagramNode("joint:j1")).toBeNull();
    expect(deviceOfDiagramNode("drive")).toBeNull();
  });
});

describe("deviceExists and deviceName", () => {
  it("looks the device up by kind and id", () => {
    expect(deviceExists(document, { kind: "drive", id: "v1" })).toBe(true);
    expect(deviceExists(document, { kind: "sensor", id: "v1" })).toBe(false);
    expect(deviceName(document, { kind: "actuator", id: "c1" })).toBe("c1");
    expect(deviceName(document, { kind: "actuator", id: "gone" })).toBeNull();
  });
});

describe("relatedJointIds", () => {
  it("a drive gives the joints of its actuators", () => {
    expect(relatedJointIds(document, { kind: "drive", id: "v1" })).toEqual(new Set(["j1", "j2"]));
    expect(relatedJointIds(document, { kind: "drive", id: "v2" }).size).toBe(0);
  });

  it("an actuator gives its joints, a sensor the joint it watches", () => {
    expect(relatedJointIds(document, { kind: "actuator", id: "c2" })).toEqual(new Set(["j2"]));
    expect(relatedJointIds(document, { kind: "sensor", id: "e1" })).toEqual(new Set(["j2"]));
    expect(relatedJointIds(document, { kind: "sensor", id: "gone" }).size).toBe(0);
  });
});
