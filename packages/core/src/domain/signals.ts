import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import {
  DRIVE_TAGS,
  type Drive,
  type DriveTag,
  JOINT_COORDINATE_UNITS,
  type PantinDocument,
  type Signal,
  type SignalOwnerKind,
  type SignalUnit,
} from "@pantin/protocol";
import { PRESENCE_SENSOR_LABELS, SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { type TagEntry, type TagOwner, tagEntries } from "./tag-entries.ts";

// The signals of a Pantin (ADR 0064 point 2): the static definition of each
// tag, in the order of the tags. Pure, derived from the document alone.

const JOINT_MEMBER_LABELS: Readonly<Record<string, string>> = {
  setpoint: "Setpoint",
  position: "Position",
};

const EMITTER_MEMBER_LABELS: Readonly<Record<string, string>> = {
  spawn: "Spawn",
};

const OWNER_KIND_LABELS: Readonly<Record<SignalOwnerKind, string>> = {
  joint: "Joint",
  drive: "Drive",
  sensor: "Sensor",
  emitter: "Emitter",
  presence_sensor: "Presence sensor",
};

interface OwnerSummary {
  kind: SignalOwnerKind;
  id: string;
  name: string;
  memberLabel: string;
}

// The name of an element is never empty (DisplayNameSchema), so it is also
// the "name, or the id" of ADR 0064 point 2.
function ownerSummary(owner: TagOwner, member: string): OwnerSummary {
  switch (owner.kind) {
    case "joint":
      return {
        kind: "joint",
        id: owner.joint.id,
        name: owner.joint.name,
        memberLabel: JOINT_MEMBER_LABELS[member] ?? member,
      };
    case "drive":
      return {
        kind: "drive",
        id: owner.drive.id,
        name: owner.drive.name,
        memberLabel: DRIVE_LABELS[owner.drive.type].en.tags[member] ?? member,
      };
    case "sensor":
      return {
        kind: "sensor",
        id: owner.sensor.id,
        name: owner.sensor.name,
        memberLabel: SENSOR_LABELS[owner.sensor.type].en.tags[member] ?? member,
      };
    case "emitter":
      return {
        kind: "emitter",
        id: owner.emitter.id,
        name: owner.emitter.name,
        memberLabel: EMITTER_MEMBER_LABELS[member] ?? member,
      };
    case "presenceSensor":
      return {
        kind: "presence_sensor",
        id: owner.presenceSensor.id,
        name: owner.presenceSensor.name,
        memberLabel: PRESENCE_SENSOR_LABELS[owner.presenceSensor.type].en.tags[member] ?? member,
      };
  }
}

// The unit of the joints a drive ends up moving, through the actuators it
// feeds (ADR 0028 point 6); unknown while it feeds none.
function drivenUnit(document: PantinDocument, drive: Drive): SignalUnit {
  const fed = document.actuators.find(
    (actuator) => actuator.feed?.drive === drive.id && actuator.joints.length > 0,
  );
  const joint = document.joints.find((candidate) => fed?.joints.includes(candidate.id));
  return (joint === undefined ? null : JOINT_COORDINATE_UNITS[joint.type]) ?? "unknown";
}

function perSecond(unit: SignalUnit): SignalUnit {
  if (unit === "metre") {
    return "metre_per_second";
  }
  return unit === "radian" ? "radian_per_second" : unit;
}

/** The unit of a drive tag from its quantity and the unit of the joints it drives. */
export function unitOfQuantity(
  quantity: DriveTag["quantity"],
  drivenJointUnit: SignalUnit,
): SignalUnit {
  if (quantity === "percent") {
    return "percent";
  }
  if (quantity === "position") {
    return drivenJointUnit;
  }
  return quantity === "speed" ? perSecond(drivenJointUnit) : "none";
}

function driveUnit(document: PantinDocument, drive: Drive, member: string): SignalUnit {
  const quantity = DRIVE_TAGS[drive.type].find((tag) => tag.member === member)?.quantity;
  return unitOfQuantity(quantity, drivenUnit(document, drive));
}

function unitOf(document: PantinDocument, entry: TagEntry): SignalUnit {
  const { owner } = entry;
  if (owner.kind === "joint") {
    return JOINT_COORDINATE_UNITS[owner.joint.type] ?? "unknown";
  }
  return owner.kind === "drive" ? driveUnit(document, owner.drive, entry.member) : "none";
}

function signalOf(document: PantinDocument, entry: TagEntry): Signal {
  const summary = ownerSummary(entry.owner, entry.member);
  return {
    name: entry.name,
    type: entry.type,
    direction: entry.direction,
    unit: unitOf(document, entry),
    owner: { kind: summary.kind, id: summary.id, name: summary.name },
    member: entry.member,
    description: `${OWNER_KIND_LABELS[summary.kind]} "${summary.name}": ${summary.memberLabel}`,
  };
}

/** Every signal of the document, in the order of its tags. */
export function deriveSignals(document: PantinDocument): Signal[] {
  return tagEntries(document).map((entry) => signalOf(document, entry));
}
