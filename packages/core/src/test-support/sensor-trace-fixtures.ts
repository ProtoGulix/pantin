import { bodyEndpoint, type Joint, type Sensor } from "@pantin/protocol";
import { joint } from "./placed-fixtures.ts";

// A prismatic "slide" in the "main" assembly of placed-fixtures.ts, a position
// switch on its upper half ("main.end.state") and an encoder ("main.counter.count").

export function slideJoint(): Joint {
  return joint({
    id: "slide",
    type: "prismatic",
    parent: bodyEndpoint("frame"),
    child: bodyEndpoint("carriage"),
    axis: [1, 0, 0],
    limits: [0, 0.1],
  });
}

export function bitSwitch(id = "end"): Sensor {
  return {
    id,
    tagKey: id,
    name: id,
    assembly: "main",
    joint: "slide",
    type: "position_switch",
    range: [0.05, 0.1],
    normallyClosed: false,
  };
}

export function encoderSensor(): Sensor {
  return {
    id: "counter",
    tagKey: "counter",
    name: "Counter",
    assembly: "main",
    joint: "slide",
    type: "encoder",
    pulsesPerUnit: 1000,
  };
}
