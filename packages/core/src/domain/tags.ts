import {
  type Actuator,
  DRIVE_TAGS,
  type Drive,
  type Joint,
  type PantinDocument,
  type RenamedTag,
  SENSOR_TAGS,
  type Sensor,
  type Tag,
  type TagDirection,
  type TagType,
  tagName,
} from "@pantin/protocol";
import { evaluateSensor, type SensorOutput } from "@pantin/sensor-types/evaluators";
import { ApiError } from "../errors.ts";
import { isMovableJoint } from "./joint-types/registry.ts";
import { currentJointPosition } from "./kinematics.ts";
import { jointStroke } from "./sensor-step.ts";

// Every tag of a Pantin, named "<assembly>.<tagKey>.<member>" (ADR 0019).
// A movable joint has a "position" feedback, and a "setpoint" command while
// no actuator moves it (ADR 0012, ADR 0028 point 9); a drive and a sensor have
// the tags their type declares (ADR 0022 point 3, ADR 0023 point 3). An
// actuator has none.

type TagOwner =
  | { kind: "joint"; joint: Joint }
  | { kind: "drive"; drive: Drive }
  // The watched joint travels with the sensor: its values come from its position.
  | { kind: "sensor"; sensor: Sensor; joint: Joint };

export interface TagEntry {
  owner: TagOwner;
  member: string;
  name: string;
  type: TagType;
  direction: TagDirection;
}

export type TagRuntime = {
  jointPositions: ReadonlyMap<string, number>;
  // Last value written to each joint's setpoint tag.
  setpoints: ReadonlyMap<string, number>;
  // Last value written to each drive command, and each drive's feedback.
  driveCommands: ReadonlyMap<string, Readonly<Record<string, number>>>;
  driveFeedback: ReadonlyMap<string, Readonly<Record<string, number>>>;
  // Each sensor's output of the last step (ADR 0025).
  sensorOutputs: ReadonlyMap<string, SensorOutput>;
};

export function movedJointIds(document: PantinDocument): Set<string> {
  return new Set(document.actuators.flatMap((actuator) => actuator.joints));
}

// A validated document always has the child and its assembly, so the empty
// fallback is never used.
function jointAssembly(document: PantinDocument, joint: Joint): string {
  return document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
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
function driveEntries(drive: Drive): TagEntry[] {
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

/** Every tag, joints first, then drives, then sensors, in document order. */
function tagEntries(document: PantinDocument): TagEntry[] {
  const moved = movedJointIds(document);
  return [
    ...document.joints
      .filter(isMovableJoint)
      .flatMap((joint) => jointEntries(document, joint, moved.has(joint.id))),
    ...document.drives.flatMap(driveEntries),
    ...document.sensors.flatMap((sensor) => sensorEntries(document, sensor)),
  ];
}

function currentValue(entry: TagEntry, runtime: TagRuntime): number {
  const { owner, member } = entry;
  if (owner.kind === "joint") {
    return member === "setpoint"
      ? (runtime.setpoints.get(owner.joint.id) ?? 0)
      : currentJointPosition(owner.joint, runtime.jointPositions);
  }
  // From the last step; a sensor not stepped yet reads its position alone (ADR 0025 point 1).
  if (owner.kind === "sensor") {
    const stepped = runtime.sensorOutputs.get(owner.sensor.id);
    const position = currentJointPosition(owner.joint, runtime.jointPositions);
    const output =
      stepped ??
      evaluateSensor({
        fields: owner.sensor,
        position,
        stroke: jointStroke(owner.joint),
        state: null,
      });
    return output.values[member] ?? 0;
  }
  const values = entry.direction === "command" ? runtime.driveCommands : runtime.driveFeedback;
  return values.get(owner.drive.id)?.[member] ?? 0;
}

export function describeTags(document: PantinDocument, runtime: TagRuntime): Tag[] {
  return tagEntries(document).map((entry) => ({
    name: entry.name,
    type: entry.type,
    direction: entry.direction,
    value: currentValue(entry, runtime),
  }));
}

// A wrong member of a real owner ("main.verin.speed") gets that owner's tag
// names; anything else gets the way to list them.
function closestTags(entries: readonly TagEntry[], wanted: string): string {
  const prefix = wanted.slice(0, wanted.lastIndexOf(".") + 1);
  const names = entries.filter((entry) => prefix !== "" && entry.name.startsWith(prefix));
  return names.length === 0
    ? "List the tags with GET /api/pantins/<id>/tags."
    : `This owner has "${names.map((entry) => entry.name).join('", "')}".`;
}

// The setpoint of a joint an actuator now moves: say which drive to command.
function movedSetpointHint(document: PantinDocument, wanted: string): string | null {
  for (const actuator of document.actuators) {
    for (const jointId of actuator.joints) {
      const joint = document.joints.find((candidate) => candidate.id === jointId);
      const setpoint = joint && tagName(jointAssembly(document, joint), joint.tagKey, "setpoint");
      if (setpoint === wanted) {
        return movedJointHint(document, jointId, actuator);
      }
    }
  }
  return null;
}

function movedJointHint(document: PantinDocument, jointId: string, actuator: Actuator): string {
  const drive = document.drives.find((candidate) => candidate.id === actuator.feed?.drive);
  const moved = `Joint "${jointId}" is moved by actuator "${actuator.id}"`;
  if (drive === undefined) {
    return `${moved}, which has no drive feeding it: give it a feed, then command the drive.`;
  }
  const commands = driveEntries(drive).filter((entry) => entry.direction === "command");
  const names = commands.map((entry) => entry.name).join('", "');
  return `${moved}, fed by drive "${drive.id}": write "${names}" instead.`;
}

/** The command tag named `wanted`; an actionable ApiError otherwise. */
export function commandTagOf(document: PantinDocument, wanted: string): TagEntry {
  const entries = tagEntries(document);
  const entry = entries.find((candidate) => candidate.name === wanted);
  if (entry === undefined) {
    const hint = movedSetpointHint(document, wanted) ?? closestTags(entries, wanted);
    throw new ApiError("not_found", `No tag "${wanted}". ${hint}`);
  }
  if (entry.direction === "feedback") {
    const commands = entries.filter(
      (candidate) => candidate.owner === entry.owner && candidate.direction === "command",
    );
    const hint = commands.length === 0 ? "" : ` Write "${commands[0]?.name}" instead.`;
    throw new ApiError(
      "invalid_request",
      `Tag "${wanted}" is feedback, written by the core only.${hint}`,
    );
  }
  return entry;
}

function ownerId(owner: TagOwner): string {
  switch (owner.kind) {
    case "joint":
      return `joint:${owner.joint.id}`;
    case "drive":
      return `drive:${owner.drive.id}`;
    case "sensor":
      return `sensor:${owner.sensor.id}`;
  }
}

/**
 * Every tag whose name differs between two versions of a document, paired by
 * owner and member. A tag that appears or disappears (a joint that became
 * fixed, or driven) is not a rename, so it is not listed.
 */
export function renamedTags(before: PantinDocument, after: PantinDocument): RenamedTag[] {
  const key = (entry: TagEntry) => `${ownerId(entry.owner)}/${entry.member}`;
  const oldNames = new Map(tagEntries(before).map((entry) => [key(entry), entry.name]));
  return tagEntries(after).flatMap((entry) => {
    const from = oldNames.get(key(entry));
    return from === undefined || from === entry.name ? [] : [{ from, to: entry.name }];
  });
}
