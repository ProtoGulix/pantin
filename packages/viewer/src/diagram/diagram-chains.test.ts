import { describe, expect, it } from "vitest";
import { chainNodeIdsOfBodies, chainOfNode, downstreamBodyIds } from "./diagram-chains.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";

// v1 feeds two cylinders, each moving one slide; v2 feeds nothing; a fixed
// joint and a joint nobody moves complete the picture.
const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a"), bodyOf("s2", "a"), bodyOf("s3", "a"), bodyOf("fixedpart", "a")],
  joints: [
    jointOf("j1", "s1"),
    jointOf("j2", "s2"),
    jointOf("j3", "s3"),
    jointOf("jf", "fixedpart", "fixed"),
  ],
  drives: [driveOf("v1", "a"), driveOf("v2", "a")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"]), cylinderOf("c2", "a", "v1", ["j2"])],
  sensors: [encoderOf("e1", "a", "j1")],
});

describe("downstreamBodyIds", () => {
  it("gives the bodies of every joint a drive's actuators move", () => {
    expect(downstreamBodyIds(document, "drive:v1")).toEqual(new Set(["s1", "s2"]));
  });

  it("gives the child of an actuator's joints, of a joint, and of a sensor's joint", () => {
    expect(downstreamBodyIds(document, "actuator:c2")).toEqual(new Set(["s2"]));
    expect(downstreamBodyIds(document, "joint:j3")).toEqual(new Set(["s3"]));
    expect(downstreamBodyIds(document, "sensor:e1")).toEqual(new Set(["s1"]));
  });

  it("gives nothing for a drive that feeds nothing or an unknown node", () => {
    expect(downstreamBodyIds(document, "drive:v2").size).toBe(0);
    expect(downstreamBodyIds(document, "joint:jf").size).toBe(0);
    expect(downstreamBodyIds(document, "nope:x").size).toBe(0);
  });
});

describe("chainOfNode", () => {
  it("links a node with what feeds it and what it feeds, not its siblings", () => {
    expect(chainOfNode(document, "joint:j1")).toEqual(
      new Set(["drive:v1", "actuator:c1", "joint:j1", "sensor:e1"]),
    );
    expect(chainOfNode(document, "drive:v1")).toEqual(
      new Set(["drive:v1", "actuator:c1", "actuator:c2", "joint:j1", "joint:j2", "sensor:e1"]),
    );
  });
});

describe("chainNodeIdsOfBodies", () => {
  it("finds the chains moving the bodies, and none for a body no joint moves", () => {
    expect(chainNodeIdsOfBodies(document, new Set(["s2"]))).toEqual(
      new Set(["drive:v1", "actuator:c2", "joint:j2"]),
    );
    expect(chainNodeIdsOfBodies(document, new Set(["frame"])).size).toBe(0);
    expect(chainNodeIdsOfBodies(document, new Set(["s3"]))).toEqual(new Set(["joint:j3"]));
  });
});
