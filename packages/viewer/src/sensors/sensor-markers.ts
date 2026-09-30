import {
  JOINT_COORDINATE_UNITS,
  type PantinDocument,
  SENSOR_PARAMETERS,
  SENSOR_TAGS,
  type Sensor,
  tagName,
} from "@pantin/protocol";
import type { Vector3Tuple } from "../frames.ts";

// What the 3D view draws for each sensor (ADR 0024), as data in the core
// frame. The shape follows the type's parameters, never its name: a range
// parameter is drawn over that range, along the axis of a joint in metres or
// as an arc about the axis of a joint in radians; any other type is a ring at
// the joint origin. The state comes from a tag the core reports.

type SensorMarkerShape =
  // Metres from the joint origin, along the axis.
  | { kind: "segment"; from: number; to: number }
  // Radians about the axis.
  | { kind: "arc"; from: number; to: number }
  | { kind: "ring" };

export interface SensorMarker {
  sensorId: string;
  // It moves with the parent, like the joint arrow; it hides with the child.
  parentBodyId: string;
  childBodyId: string;
  origin: Vector3Tuple;
  axis: Vector3Tuple;
  shape: SensorMarkerShape;
  // The bit that lights it; null for a type without one.
  stateTag: string | null;
}

function rangeOf(sensor: Sensor): [number, number] | null {
  const parameter = SENSOR_PARAMETERS[sensor.type].find((item) => item.kind === "coordinateRange");
  const range: unknown = parameter === undefined ? undefined : Reflect.get(sensor, parameter.field);
  return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
    ? [Number(range[0]), Number(range[1])]
    : null;
}

function markerOf(document: PantinDocument, sensor: Sensor): SensorMarker | null {
  const joint = document.joints.find((candidate) => candidate.id === sensor.joint);
  const unit = joint === undefined ? null : JOINT_COORDINATE_UNITS[joint.type];
  if (joint === undefined || unit === null) {
    return null;
  }
  const range = rangeOf(sensor);
  const bit = SENSOR_TAGS[sensor.type].find((tag) => tag.type === "bit");
  return {
    sensorId: sensor.id,
    parentBodyId: joint.parent,
    childBodyId: joint.child,
    origin: joint.origin,
    axis: joint.axis,
    shape:
      range === null
        ? { kind: "ring" }
        : { kind: unit === "metre" ? "segment" : "arc", from: range[0], to: range[1] },
    stateTag: bit === undefined ? null : tagName(sensor.assembly, sensor.tagKey, bit.member),
  };
}

export function sensorMarkersOf(document: PantinDocument | undefined): SensorMarker[] {
  if (document === undefined) {
    return [];
  }
  return document.sensors.flatMap((sensor) => markerOf(document, sensor) ?? []);
}
