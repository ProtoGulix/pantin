import { describe, expect, it } from "vitest";
import { conveyorPantin } from "./conveyors/conveyor-fixtures.ts";
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

describe("phase 6 objects as devices", () => {
  const conveyors = conveyorPantin().document;

  it("exist, are named and are found by kind and id", () => {
    expect(deviceExists(conveyors, { kind: "belt", id: "feed" })).toBe(true);
    expect(deviceExists(conveyors, { kind: "belt", id: "side" })).toBe(false);
    expect(deviceName(conveyors, { kind: "presenceSensor", id: "cell" })).toBe("Cell");
    expect(deviceName(conveyors, { kind: "emitter", id: "ghost" })).toBeNull();
  });

  it("have no diagram node, so a diagram id never selects one", () => {
    expect(deviceNodeId({ kind: "guide", id: "side" })).toBe("guide:side");
    expect(deviceOfDiagramNode("guide:side")).toEqual({ kind: "guide", id: "side" });
    expect(deviceOfDiagramNode("joint:spin")).toBeNull();
  });

  it("relate a belt to its drum joint and the others to none", () => {
    expect([...relatedJointIds(conveyors, { kind: "belt", id: "feed" })]).toEqual(["spin"]);
    expect(relatedJointIds(conveyors, { kind: "absorber", id: "sink" }).size).toBe(0);
  });
});
