import {
  DRIVE_TAGS,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  jointTagName,
  type PantinDocument,
  tagName,
} from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import { quantityConversionUnit } from "./parameter-units.ts";

/**
 * The unit to convert a drive's float tag with, from what the user types to
 * SI; null when the tag is not a coordinate (a percent) or the name is not a
 * drive tag.
 */
export function driveTagUnit(document: PantinDocument, name: string): JointCoordinateUnit | null {
  for (const drive of document.drives) {
    const tag = DRIVE_TAGS[drive.type].find(
      (candidate) => tagName(drive.assembly, drive.tagKey, candidate.member) === name,
    );
    if (tag !== undefined) {
      return quantityConversionUnit(tag.quantity, driveCoordinateUnit(document, drive.id));
    }
  }
  return null;
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
