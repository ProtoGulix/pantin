import {
  DRIVE_TAGS,
  type JointCoordinateUnit,
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
