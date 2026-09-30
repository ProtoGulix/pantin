import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { DRIVE_TAGS, type Joint, type PantinResponse, tagName } from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { type GroupDraft, row } from "./property-rows.ts";

// What moves a joint, in the joint's properties (ADR 0028): its actuator, the
// drive that feeds it and the command tags of that drive. Read only: actuators
// are edited in the drives panel, opened from the joint's context menu.
export function jointActuatorGroup(
  joint: Joint,
  pantin: PantinResponse,
  language: Language,
  t: Translate,
): GroupDraft {
  const { document } = pantin;
  const actuator = actuatorOfJoint(document, joint.id);
  if (actuator === undefined) {
    return {
      id: "actuator",
      rows: [{ ...row("none", t("properties.actuator"), t("properties.noActuator")), muted: true }],
    };
  }
  const rows = [
    row(
      "actuator",
      t("properties.actuator"),
      `${actuator.name} · ${ACTUATOR_LABELS[actuator.type][language].name}`,
    ),
  ];
  const drive = document.drives.find((candidate) => candidate.id === actuator.feed?.drive);
  if (drive === undefined) {
    return { id: "actuator", rows };
  }
  const commands = DRIVE_TAGS[drive.type]
    .filter((tag) => tag.direction === "command")
    .map((tag) => tagName(drive.assembly, drive.tagKey, tag.member));
  return {
    id: "actuator",
    rows: [
      ...rows,
      row(
        "drive",
        t("properties.drive"),
        `${drive.name} · ${DRIVE_LABELS[drive.type][language].name}`,
      ),
      { ...row("driveCommands", t("properties.driveCommands"), commands.join(", ")), muted: true },
    ],
  };
}
