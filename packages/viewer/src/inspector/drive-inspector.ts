import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { DRIVE_PARAMETERS, DRIVE_TAGS, type Drive, tagName } from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import type { DeviceRef } from "../device-selection.ts";
import { driveFormFor } from "../drives/drive-form.ts";
import {
  parameterUnitLabel,
  quantityConversionUnit,
  quantityUnitLabel,
} from "../drives/parameter-units.ts";
import { type GroupDraft, liveRow, type PropertyRow, row } from "../properties/property-rows.ts";
import { deviceFieldEditor, deviceNameRow, withUnit } from "./device-fields.ts";
import type { InspectorContext } from "./inspector-context.ts";

// The inspector of a drive (ADR 0030 point 2): its fields, its command tags
// with forcing, its feedback tags, the fault it can be given and what the core
// says is wrong with its commands.

function parameterRows(drive: Drive, context: InspectorContext): PropertyRow[] {
  const { pantin, language, t } = context;
  const device: DeviceRef = { kind: "drive", id: drive.id };
  const labels = DRIVE_LABELS[drive.type][language];
  const unit = driveCoordinateUnit(pantin.document, drive.id);
  const values = driveFormFor(drive, pantin.document).values;
  return DRIVE_PARAMETERS[drive.type].map((parameter) =>
    row(
      `parameter-${parameter.field}`,
      withUnit(
        labels.parameters[parameter.field] ?? parameter.field,
        parameterUnitLabel(parameter.kind, unit, t),
      ),
      values[parameter.field] ?? "",
      deviceFieldEditor(device, parameter.field),
    ),
  );
}

function tagRows(drive: Drive, direction: "command" | "feedback", context: InspectorContext) {
  const { pantin, language, t } = context;
  const labels = DRIVE_LABELS[drive.type][language];
  const unit = driveCoordinateUnit(pantin.document, drive.id);
  return DRIVE_TAGS[drive.type]
    .filter((tag) => tag.direction === direction)
    .map((tag): PropertyRow => {
      const name = tagName(drive.assembly, drive.tagKey, tag.member);
      const label = withUnit(
        labels.tags[tag.member] ?? tag.member,
        quantityUnitLabel(tag.quantity, unit, t),
      );
      const format = tag.type === "bit" ? "bit" : "number";
      const live = {
        kind: "tag",
        tag: name,
        unit: quantityConversionUnit(tag.quantity, unit),
        format,
      } as const;
      if (direction === "feedback") {
        return liveRow(tag.member, label, live);
      }
      const edit =
        tag.type === "bit"
          ? ({ input: "toggle", action: { kind: "bitTag", tag: name }, on: false } as const)
          : ({ input: "number", tag: name } as const);
      return liveRow(tag.member, label, live, edit);
    });
}

function faultRows(drive: Drive, context: InspectorContext): PropertyRow[] {
  const { faults, t } = context;
  return [
    row("unresponsive", t("drives.fault.unresponsive"), "", {
      input: "toggle",
      action: { kind: "driveUnresponsive", driveId: drive.id },
      on: faults.unresponsiveDrives.includes(drive.id),
    }),
    liveRow("diagnostics", t("inspector.diagnostics"), {
      kind: "diagnostics",
      driveId: drive.id,
      driveType: drive.type,
    }),
  ];
}

export function driveGroups(drive: Drive, context: InspectorContext): GroupDraft[] {
  const { language, t } = context;
  const device: DeviceRef = { kind: "drive", id: drive.id };
  const parameters = parameterRows(drive, context);
  const groups: GroupDraft[] = [
    {
      id: "general",
      rows: [
        deviceNameRow(device, drive.name, t),
        row("type", t("drives.form.type"), DRIVE_LABELS[drive.type][language].name),
        // The prefix of its tags: assembly key and tag key (ADR 0019).
        row("tagPrefix", t("inspector.tagPrefix"), `${drive.assembly}.${drive.tagKey}`),
      ],
    },
    ...(parameters.length === 0 ? [] : [{ id: "parameters" as const, rows: parameters }]),
    { id: "commands", rows: tagRows(drive, "command", context) },
    { id: "feedback", rows: tagRows(drive, "feedback", context) },
    { id: "faults", rows: faultRows(drive, context) },
  ];
  return groups.filter((group) => group.rows.length > 0);
}
