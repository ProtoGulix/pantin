import { makeUniqueId } from "./ids.ts";
import { isJsonObject, type JsonObject } from "./json-object.ts";

// Version 9 splits each drive of ADR 0022 into a drive (what the PLC commands)
// and an actuator (what moves the joints), ADR 0028 point 12. The drive keeps
// its id, name, assembly and tag key, so that tag names change only in their
// member (extend becomes coil_14). The actuator takes the drive's name and
// joints and is fed by the default feed of its type. Tag values are runtime
// state, never in the document, so nothing else moves.

type DriveAndActuator = { drive: JsonObject; actuator: JsonObject };

const NAMED_FIELDS = ["id", "tagKey", "name", "assembly"] as const;

function numberField(drive: JsonObject, field: string): number | null {
  const value = drive[field];
  return typeof value === "number" ? value : null;
}

function pick(drive: JsonObject, fields: readonly string[]): JsonObject {
  return Object.fromEntries(fields.map((field) => [field, drive[field]]));
}

// An actuator carries the drive's name and assembly and, for want of anything
// better, a feed from that drive; its id is chosen by the caller.
function actuatorOf(drive: JsonObject, fields: JsonObject, ports: Record<string, string>) {
  return {
    ...pick(drive, ["name", "assembly"]),
    ...fields,
    feed: { drive: drive.id, ports },
    joints: drive.joints,
  };
}

// The single `speed` becomes both speeds; the second one is `retractSpeed` for
// a double-acting cylinder and `returnSpeed` for a single-acting one.
function cylinderOf(
  drive: JsonObject,
  driveType: string,
  secondSpeedField: string,
  ports: Record<string, string>,
) {
  const speed = numberField(drive, "speed");
  if (speed === null) {
    return null;
  }
  // The actuator type has the name of the old drive type.
  const type = drive.type;
  return {
    drive: { ...pick(drive, NAMED_FIELDS), type: driveType },
    actuator: actuatorOf(drive, { type, extendSpeed: speed, [secondSpeedField]: speed }, ports),
  };
}

// The ramp was in joint units per s²; it becomes a share of the nominal speed
// per s. Without a nominal speed (motor_analog) one unit per s stands for 100 %.
function motorOf(drive: JsonObject, driveType: string): DriveAndActuator | null {
  const acceleration = numberField(drive, "acceleration");
  const nominalSpeed = drive.type === "motor_analog" ? 1 : numberField(drive, "nominalSpeed");
  // A zero nominal speed would make the ramp infinite.
  if (acceleration === null || nominalSpeed === null || nominalSpeed === 0) {
    return null;
  }
  return {
    drive: {
      ...pick(drive, NAMED_FIELDS),
      type: driveType,
      acceleration: (acceleration / nominalSpeed) * 100,
    },
    actuator: actuatorOf(drive, { type: "ac_motor", nominalSpeed }, { in: "out" }),
  };
}

function servoOf(drive: JsonObject): DriveAndActuator | null {
  const maxSpeed = numberField(drive, "maxSpeed");
  const maxAcceleration = numberField(drive, "maxAcceleration");
  if (maxSpeed === null || maxAcceleration === null) {
    return null;
  }
  return {
    drive: { ...pick(drive, NAMED_FIELDS), type: "servo_drive", maxSpeed, maxAcceleration },
    actuator: actuatorOf(drive, { type: "servo_motor" }, { in: "out" }),
  };
}

// The migration invents nothing for a drive it cannot read: the schema then
// says what is wrong with it.
function isReadable(drive: JsonObject): boolean {
  const { id, joints } = drive;
  return (
    typeof id === "string" &&
    Array.isArray(joints) &&
    joints.every((joint) => typeof joint === "string")
  );
}

function splitDrive(drive: JsonObject): DriveAndActuator | null {
  if (!isReadable(drive)) {
    return null;
  }
  switch (drive.type) {
    case "double_acting_cylinder":
      return cylinderOf(drive, "valve_5_3_closed", "retractSpeed", {
        cap: "port_4",
        rod: "port_2",
      });
    case "single_acting_cylinder":
      return cylinderOf(drive, "valve_3_2_single", "returnSpeed", { cap: "port_2" });
    case "motor_on_off":
      return motorOf(drive, "vfd_on_off");
    case "motor_analog":
      return motorOf(drive, "vfd_analog");
    case "servo_axis":
      return servoOf(drive);
    default:
      return null;
  }
}

const ACTUATOR_ID_SUFFIX = "-actuator";
const MAX_DRIVE_ID_LENGTH = 64 - ACTUATOR_ID_SUFFIX.length;

// "<drive id>-actuator": derived from the drive id, so that migrating twice
// gives the same ids.
function actuatorId(drive: JsonObject, taken: Set<string>): string {
  const base = String(drive.id).slice(0, MAX_DRIVE_ID_LENGTH).replace(/-+$/, "");
  const id = makeUniqueId(`${base}${ACTUATOR_ID_SUFFIX}`, taken);
  taken.add(id);
  return id;
}

export function migrateV8ToV9(document: JsonObject): JsonObject {
  const oldDrives = Array.isArray(document.drives) ? document.drives : [];
  const drives: unknown[] = [];
  const actuators: unknown[] = [];
  const takenActuatorIds = new Set<string>();
  for (const old of oldDrives) {
    const split = isJsonObject(old) ? splitDrive(old) : null;
    if (split === null || !isJsonObject(old)) {
      // Left to the document schema, which says what is wrong.
      drives.push(old);
      continue;
    }
    drives.push(split.drive);
    actuators.push({ id: actuatorId(old, takenActuatorIds), ...split.actuator });
  }
  return { ...document, schema_version: 9, drives, actuators };
}
