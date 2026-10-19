import {
  DRIVE_TAGS,
  type Drive,
  type Emitter,
  endpointAssemblyIn,
  type Joint,
  type PantinDocument,
  PRESENCE_SENSOR_TAGS,
  type PresenceSensor,
  SENSOR_TAGS,
  type Sensor,
  type TagDirection,
  type TagType,
  tagName,
} from "@pantin/protocol";
import { isMovableJoint } from "./joint-types/registry.ts";

// The tag entries of a Pantin: one per tag, with its owner (see tags.ts).

export type TagOwner =
  | { kind: "joint"; joint: Joint }
  | { kind: "drive"; drive: Drive }
  // The watched joint travels with the sensor: its values come from its position.
  | { kind: "sensor"; sensor: Sensor; joint: Joint }
  | { kind: "emitter"; emitter: Emitter }
  | { kind: "presenceSensor"; presenceSensor: PresenceSensor };

export interface TagEntry {
  owner: TagOwner;
  member: string;
  name: string;
  type: TagType;
  direction: TagDirection;
}
export function movedJointIds(document: PantinDocument): Set<string> {
  return new Set(document.actuators.flatMap((actuator) => actuator.joints));
}

// A validated document always has the child and its assembly (the child
// itself for a group), so the empty fallback is never used.
export function jointAssembly(document: PantinDocument, joint: Joint): string {
  return endpointAssemblyIn(joint.child, document.bodies) ?? "";
}

function jointEntries(document: PantinDocument, joint: Joint, moved: boolean): TagEntry[] {
  const owner: TagOwner = { kind: "joint", joint };
  const name = (member: string) => tagName(jointAssembly(document, joint), joint.tagKey, member);
  const position: TagEntry = {
    owner,
    member: "position",
    name: name("position"),
    type: "float",
    direction: "feedback",
  };
  if (moved) {
    return [position];
  }
  const setpoint: TagEntry = {
    owner,
    member: "setpoint",
    name: name("setpoint"),
    type: "float",
    direction: "command",
  };
  return [setpoint, position];
}

// The entries of one owner share one owner object: commandTagOf compares them.
export function driveEntries(drive: Drive): TagEntry[] {
  const owner: TagOwner = { kind: "drive", drive };
  return DRIVE_TAGS[drive.type].map((tag) => ({
    owner,
    member: tag.member,
    name: tagName(drive.assembly, drive.tagKey, tag.member),
    type: tag.type,
    direction: tag.direction,
  }));
}

function sensorEntries(document: PantinDocument, sensor: Sensor): TagEntry[] {
  const joint = document.joints.find((candidate) => candidate.id === sensor.joint);
  // A validated document always has the watched joint (ADR 0023 point 3).
  if (joint === undefined) {
    throw new Error(`Sensor "${sensor.id}" watches "${sensor.joint}", which is missing.`);
  }
  const owner: TagOwner = { kind: "sensor", sensor, joint };
  return SENSOR_TAGS[sensor.type].map((tag) => ({
    owner,
    member: tag.member,
    name: tagName(sensor.assembly, sensor.tagKey, tag.member),
    type: tag.type,
    direction: tag.direction,
  }));
}

// The spawn bit is latched when written (ADR 0043 point 5, wired with the spawns).
function emitterEntries(emitter: Emitter): TagEntry[] {
  return [
    {
      owner: { kind: "emitter", emitter },
      member: "spawn",
      name: tagName(emitter.assembly, emitter.tagKey, "spawn"),
      type: "bit",
      direction: "command",
    },
  ];
}

function presenceSensorEntries(presenceSensor: PresenceSensor): TagEntry[] {
  const owner: TagOwner = { kind: "presenceSensor", presenceSensor };
  return PRESENCE_SENSOR_TAGS[presenceSensor.type].map((tag) => ({
    owner,
    member: tag.member,
    name: tagName(presenceSensor.assembly, presenceSensor.tagKey, tag.member),
    type: tag.type,
    direction: tag.direction,
  }));
}

/** Every tag: joints, drives, joint sensors, emitters, then presence sensors, in document order. */
export function tagEntries(document: PantinDocument): TagEntry[] {
  const moved = movedJointIds(document);
  return [
    ...document.joints
      .filter(isMovableJoint)
      .flatMap((joint) => jointEntries(document, joint, moved.has(joint.id))),
    ...document.drives.flatMap(driveEntries),
    ...document.sensors.flatMap((sensor) => sensorEntries(document, sensor)),
    ...document.emitters.flatMap(emitterEntries),
    ...document.presenceSensors.flatMap(presenceSensorEntries),
  ];
}
