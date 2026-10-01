import {
  DRIVE_TAGS,
  type Drive,
  type DriveTag,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  jointTagName,
  type PantinDocument,
  tagName,
} from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import type { Translate } from "../i18n/translate.ts";
import { quantityConversionUnit, quantityUnitLabel } from "./parameter-units.ts";

function driveTagOf(
  document: PantinDocument,
  name: string,
): { drive: Drive; tag: DriveTag } | null {
  for (const drive of document.drives) {
    const tag = DRIVE_TAGS[drive.type].find(
      (candidate) => tagName(drive.assembly, drive.tagKey, candidate.member) === name,
    );
    if (tag !== undefined) {
      return { drive, tag };
    }
  }
  return null;
}

/**
 * The unit to convert a drive's float tag with, from what the user types to
 * SI; null when the tag is not a coordinate (a percent) or the name is not a
 * drive tag.
 */
export function driveTagUnit(document: PantinDocument, name: string): JointCoordinateUnit | null {
  const found = driveTagOf(document, name);
  return found === null
    ? null
    : quantityConversionUnit(found.tag.quantity, driveCoordinateUnit(document, found.drive.id));
}

/** The same for the setpoint of a joint, in the unit of its coordinate; null for another name. */
function jointSetpointUnit(document: PantinDocument, name: string): JointCoordinateUnit | null {
  for (const joint of document.joints) {
    const assembly = document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
    if (jointTagName(assembly, joint.tagKey, "setpoint") === name) {
      return JOINT_COORDINATE_UNITS[joint.type];
    }
  }
  return null;
}

/** The unit to convert a float tag the inspector forces, a drive's or a joint's setpoint. */
export function forcedTagUnit(document: PantinDocument, name: string): JointCoordinateUnit | null {
  return driveTagUnit(document, name) ?? jointSetpointUnit(document, name);
}

/** The symbol next to a forced drive tag ("mm", "°/s", "%"); null when it has none. */
export function forcedTagUnitLabel(
  document: PantinDocument,
  name: string,
  t: Translate,
): string | null {
  const found = driveTagOf(document, name);
  if (found === null) {
    return null;
  }
  const unit = driveCoordinateUnit(document, found.drive.id);
  return quantityUnitLabel(found.tag.quantity, unit, t);
}
