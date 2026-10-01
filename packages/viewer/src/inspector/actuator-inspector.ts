import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { ACTUATOR_PARAMETERS, type Actuator } from "@pantin/protocol";
import { actuatorFormFor } from "../actuators/actuator-form.ts";
import { jointsCoordinateUnit } from "../actuators/actuator-joints.ts";
import type { DeviceRef } from "../device-selection.ts";
import { parameterUnitLabel } from "../drives/parameter-units.ts";
import { type GroupDraft, row } from "../properties/property-rows.ts";
import { DEVICE_NAME_GROUP, deviceFieldEditor, deviceNameRow, withUnit } from "./device-fields.ts";
import type { InspectorContext } from "./inspector-context.ts";

// The inspector of an actuator (ADR 0030 point 2): its fields and parameters.
// Its feed and the joints it moves are not repeated: the diagram draws them.

export function actuatorGroups(actuator: Actuator, context: InspectorContext): GroupDraft[] {
  const { pantin, language, t } = context;
  const device: DeviceRef = { kind: "actuator", id: actuator.id };
  const labels = ACTUATOR_LABELS[actuator.type][language];
  const unit = jointsCoordinateUnit(pantin.document, actuator.joints);
  const values = actuatorFormFor(actuator, pantin.document).values;
  const parameters = ACTUATOR_PARAMETERS[actuator.type].map((parameter) =>
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
  return [
    {
      id: DEVICE_NAME_GROUP,
      rows: [
        deviceNameRow(device, actuator.name, t),
        row("type", t("drives.form.type"), labels.name),
      ],
    },
    ...(parameters.length === 0 ? [] : [{ id: "parameters" as const, rows: parameters }]),
  ];
}
