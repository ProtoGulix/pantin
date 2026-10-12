import {
  type Actuator,
  type PantinDocument,
  type RenamedTag,
  type Tag,
  tagName,
} from "@pantin/protocol";
import { evaluateSensor, type SensorOutput } from "@pantin/sensor-types/evaluators";
import { ApiError } from "../errors.ts";
import { currentJointPosition } from "./kinematics.ts";
import type { PhysicsState } from "./physics-state.ts";
import { jointStroke } from "./sensor-step.ts";
import {
  driveEntries,
  jointAssembly,
  type TagEntry,
  type TagOwner,
  tagEntries,
} from "./tag-entries.ts";

// Every tag of a Pantin, named "<assembly>.<tagKey>.<member>" (ADR 0019).
// A movable joint has a "position" feedback, and a "setpoint" command while
// no actuator moves it (ADR 0012, ADR 0028 point 9); a drive and a sensor have
// the tags their type declares (ADR 0022 point 3, ADR 0023 point 3). An
// actuator has none. An emitter has a "spawn" command and a presence sensor
// the "state" its type declares (ADR 0043 points 5 and 7), both listed after
// the joint sensors (tag-entries.ts).

export type TagRuntime = {
  jointPositions: ReadonlyMap<string, number>;
  // Last value written to each joint's setpoint tag.
  setpoints: ReadonlyMap<string, number>;
  // Last value written to each drive command, and each drive's feedback.
  driveCommands: ReadonlyMap<string, Readonly<Record<string, number>>>;
  driveFeedback: ReadonlyMap<string, Readonly<Record<string, number>>>;
  // Each sensor's output of the last step (ADR 0025).
  sensorOutputs: ReadonlyMap<string, SensorOutput>;
  // The emitters' last spawn values and the presence sensors' outputs (ADR 0043 point 11).
  physicsState: PhysicsState;
};

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
  if (owner.kind === "emitter") {
    return runtime.physicsState.spawnValues.get(owner.emitter.id) ?? 0;
  }
  if (owner.kind === "presenceSensor") {
    return runtime.physicsState.presenceOutputs.get(owner.presenceSensor.id)?.[member] ?? 0;
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
    case "emitter":
      return `emitter:${owner.emitter.id}`;
    case "presenceSensor":
      return `presenceSensor:${owner.presenceSensor.id}`;
  }
}

const tagKeyOf = (entry: TagEntry) => `${ownerId(entry.owner)}/${entry.member}`;

/**
 * Every tag whose name differs between two versions of a document, paired by
 * owner and member. A tag that appears or disappears (a joint that became
 * fixed, or driven) is not a rename, so it is not listed.
 */
export function renamedTags(before: PantinDocument, after: PantinDocument): RenamedTag[] {
  const oldNames = new Map(tagEntries(before).map((entry) => [tagKeyOf(entry), entry.name]));
  return tagEntries(after).flatMap((entry) => {
    const from = oldNames.get(tagKeyOf(entry));
    return from === undefined || from === entry.name ? [] : [{ from, to: entry.name }];
  });
}

/**
 * The tag names that exist only before, and only after, paired by owner and
 * member like `renamedTags`: a renamed tag is in neither list.
 */
export function vanishedAndAppearedTags(
  before: PantinDocument,
  after: PantinDocument,
): { removedTags: string[]; addedTags: string[] } {
  const beforeEntries = tagEntries(before);
  const afterEntries = tagEntries(after);
  const keysBefore = new Set(beforeEntries.map(tagKeyOf));
  const keysAfter = new Set(afterEntries.map(tagKeyOf));
  return {
    removedTags: beforeEntries
      .filter((entry) => !keysAfter.has(tagKeyOf(entry)))
      .map((e) => e.name),
    addedTags: afterEntries.filter((entry) => !keysBefore.has(tagKeyOf(entry))).map((e) => e.name),
  };
}
