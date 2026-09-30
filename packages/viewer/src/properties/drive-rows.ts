import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { DRIVE_TAGS, type Joint, type PantinResponse, tagName } from "@pantin/protocol";
import { driveOfJoint } from "../drives/drive-form.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { type GroupDraft, row } from "./property-rows.ts";

// The drive of a joint, in the joint's properties (ADR 0022): which drive
// moves it and which command tags drive it. Read only: drives are edited in
// the drives panel, opened from the joint's context menu.
export function jointDriveGroup(
  joint: Joint,
  pantin: PantinResponse,
  language: Language,
  t: Translate,
): GroupDraft {
  const drive = driveOfJoint(pantin.document, joint.id);
  if (drive === undefined) {
    return {
      id: "drive",
      rows: [{ ...row("none", t("properties.drive"), t("properties.noDrive")), muted: true }],
    };
  }
  const commands = DRIVE_TAGS[drive.type]
    .filter((tag) => tag.direction === "command")
    .map((tag) => tagName(drive.assembly, drive.tagKey, tag.member));
  return {
    id: "drive",
    rows: [
      row(
        "drive",
        t("properties.drive"),
        `${drive.name} · ${DRIVE_LABELS[drive.type][language].name}`,
      ),
      { ...row("driveCommands", t("properties.driveCommands"), commands.join(", ")), muted: true },
    ],
  };
}
