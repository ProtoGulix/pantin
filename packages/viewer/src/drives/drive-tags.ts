import {
  DRIVE_TAGS,
  type JointCoordinateUnit,
  type PantinDocument,
  tagName,
} from "@pantin/protocol";
import { driveCoordinateUnit } from "./drive-form.ts";

/** The unit of a drive's float tag, to convert what the user types; null if unknown. */
export function driveTagUnit(document: PantinDocument, name: string): JointCoordinateUnit | null {
  for (const drive of document.drives) {
    const owns = DRIVE_TAGS[drive.type].some(
      (tag) => tagName(drive.assembly, drive.tagKey, tag.member) === name,
    );
    if (owns) {
      return driveCoordinateUnit(document, drive.joints);
    }
  }
  return null;
}
