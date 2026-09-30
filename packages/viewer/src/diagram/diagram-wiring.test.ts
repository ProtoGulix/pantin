import { describe, expect, it } from "vitest";
import { type Endpoint, linkBetween, removalBetween } from "./diagram-wiring.ts";
import { wiringDocument } from "./diagram-wiring-fixtures.ts";

// What a drop or a "Relier à…" asks of the core (ADR 0029 point 6).

const output = (drive: string, port: string): Endpoint => ({
  nodeId: `drive:${drive}`,
  socketId: `out:${port}`,
});
const input = (actuator: string, port: string): Endpoint => ({
  nodeId: `actuator:${actuator}`,
  socketId: `in:${port}`,
});
const movedJoints = (actuator: string): Endpoint => ({
  nodeId: `actuator:${actuator}`,
  socketId: "out",
});
const joint = (id: string): Endpoint => ({ nodeId: `joint:${id}`, socketId: "in" });
const watching = (sensor: string): Endpoint => ({ nodeId: `sensor:${sensor}`, socketId: "in" });

function actuatorRequestOf(result: ReturnType<typeof linkBetween>) {
  return result.ok && result.edit.kind === "actuator" ? result.edit.request : null;
}

describe("a drive output dropped on an actuator input", () => {
  it("replaces the input's port on a fed actuator, from the same drive", () => {
    const result = linkBetween(wiringDocument, output("v1", "port_2"), input("cyl1", "cap"));
    // rod read port_2: the two ports swap, a feed never reads one port twice.
    expect(actuatorRequestOf(result)?.feed).toEqual({
      drive: "v1",
      ports: { cap: "port_2", rod: "port_4" },
    });
    expect(result.ok && result.confirm).toBeNull();
  });

  it("gives an actuator without feed the default feed, with the dropped port", () => {
    const result = linkBetween(wiringDocument, output("v1", "port_2"), input("cyl2", "cap"));
    expect(actuatorRequestOf(result)?.feed).toEqual({
      drive: "v1",
      ports: { cap: "port_2", rod: "port_4" },
    });
    expect(result.ok && result.confirm).toBeNull();
  });

  it("keeps the other input ports at their default on a plain drop", () => {
    const result = linkBetween(wiringDocument, output("v1", "port_4"), input("cyl2", "cap"));
    expect(actuatorRequestOf(result)?.feed?.ports).toEqual({ cap: "port_4", rod: "port_2" });
  });

  it("replaces the whole feed from another drive, after a confirmation", () => {
    const result = linkBetween(wiringDocument, output("v2", "port_2"), input("cyl1", "cap"));
    expect(actuatorRequestOf(result)?.feed?.drive).toBe("v2");
    expect(result.ok && result.confirm).toEqual({
      actuatorName: "cyl1",
      fromDrive: "v1",
      toDrive: "v2",
    });
  });
});

describe("a drive output that cannot be dropped there", () => {
  it("refuses another domain, saying which ports do not fit", () => {
    const result = linkBetween(wiringDocument, output("sv", "out"), input("cyl1", "cap"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.domain");
  });

  it("refuses a drive that cannot feed every input of the actuator", () => {
    const result = linkBetween(wiringDocument, output("v3", "port_2"), input("cyl2", "cap"));
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.noDefaultFeed");
  });

  it("says when the port is already read by that input", () => {
    const result = linkBetween(wiringDocument, output("v1", "port_4"), input("cyl1", "cap"));
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.alreadyLinked");
  });
});

describe("the same link from either end", () => {
  it("is the same link whichever end the user started from", () => {
    const forward = linkBetween(wiringDocument, output("v1", "port_2"), input("cyl1", "cap"));
    const backward = linkBetween(wiringDocument, input("cyl1", "cap"), output("v1", "port_2"));
    expect(backward).toEqual(forward);
  });

  it("does not send the id, which is the URL's", () => {
    const request = actuatorRequestOf(
      linkBetween(wiringDocument, output("v1", "port_2"), input("cyl1", "cap")),
    );
    expect(request).not.toBeNull();
    expect(request !== null && "id" in request).toBe(false);
  });
});

describe("an actuator dropped on a joint", () => {
  it("adds the joint to the actuator", () => {
    const result = linkBetween(wiringDocument, movedJoints("cyl1"), joint("j3"));
    expect(actuatorRequestOf(result)?.joints).toEqual(["j1", "j3"]);
  });

  it("refuses a joint another actuator moves, naming it", () => {
    const result = linkBetween(wiringDocument, movedJoints("cyl2"), joint("j2"));
    expect(!result.ok && result.refusal).toEqual({
      key: "diagram.refusal.jointMoved",
      parameters: { joint: "j2", actuator: "motor" },
    });
  });

  it("refuses a joint of another unit than the actuator's joints", () => {
    const result = linkBetween(wiringDocument, movedJoints("cyl1"), joint("jr"));
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.jointUnit");
    expect(linkBetween(wiringDocument, movedJoints("cyl2"), joint("jr")).ok).toBe(true);
  });

  it("refuses a fixed joint and a joint it already moves", () => {
    const fixed = linkBetween(wiringDocument, movedJoints("cyl1"), joint("jf"));
    expect(!fixed.ok && fixed.refusal.key).toBe("diagram.refusal.jointFixed");
    const again = linkBetween(wiringDocument, movedJoints("cyl1"), joint("j1"));
    expect(!again.ok && again.refusal.key).toBe("diagram.refusal.alreadyLinked");
  });
});

describe("a sensor dropped on a joint", () => {
  it("moves the sensor's watch to that joint, keeping its other fields", () => {
    const result = linkBetween(wiringDocument, watching("e1"), joint("j3"));
    const request = result.ok && result.edit.kind === "sensor" ? result.edit.request : null;
    expect(request).toMatchObject({ type: "encoder", joint: "j3", name: "e1" });
    expect(request !== null && "tagKey" in request).toBe(false);
  });

  it("says when it already watches that joint", () => {
    const result = linkBetween(wiringDocument, watching("e1"), joint("j1"));
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.alreadyLinked");
  });
});

describe("two sockets that are not a pair", () => {
  it("are refused as not linkable", () => {
    const result = linkBetween(wiringDocument, output("v1", "port_2"), joint("j1"));
    expect(!result.ok && result.linkable).toBe(false);
  });
});

describe("removeBetween", () => {
  it("removes a whole feed and keeps the joints", () => {
    const result = removalBetween(wiringDocument, "drive:v1", "actuator:cyl1");
    const request = actuatorRequestOf(result);
    expect(request?.feed).toBeUndefined();
    expect(request?.joints).toEqual(["j1"]);
  });

  it("removes one joint of an actuator and keeps the feed", () => {
    const result = removalBetween(wiringDocument, "actuator:cyl1", "joint:j1");
    const request = actuatorRequestOf(result);
    expect(request?.joints).toEqual([]);
    expect(request?.feed?.drive).toBe("v1");
  });

  it("refuses to remove a sensor's link, which says to move it instead", () => {
    const result = removalBetween(wiringDocument, "joint:j1", "sensor:e1");
    expect(!result.ok && result.refusal.key).toBe("diagram.refusal.sensorNeedsJoint");
  });
});
