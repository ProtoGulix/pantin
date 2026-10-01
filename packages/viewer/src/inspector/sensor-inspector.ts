import { SENSOR_TAGS, type Sensor, tagName } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import type { DeviceRef } from "../device-selection.ts";
import { sensorFormInputs } from "../panel/sensor-form-model.ts";
import { type GroupDraft, liveRow, type PropertyRow, row } from "../properties/property-rows.ts";
import { sensorFormFor } from "../sensors/sensor-form.ts";
import { deviceFieldEditor, deviceNameRow, yesNoOptions } from "./device-fields.ts";
import type { InspectorContext } from "./inspector-context.ts";

// The inspector of a sensor (ADR 0030 point 2): its fields, its parameters in
// the display unit of the joint it watches, and its state, live.

// A parameter as the form shows it: typed, chosen, or a yes or no flag.
function parameterRows(sensor: Sensor, context: InspectorContext): PropertyRow[] {
  const { pantin, language, t } = context;
  const device: DeviceRef = { kind: "sensor", id: sensor.id };
  const form = sensorFormFor(sensor, pantin.document);
  const inputs = sensorFormInputs(form, language, pantin.document, t);
  return inputs.map((input) => {
    const target = { kind: "deviceField", device, fieldId: input.key } as const;
    const id = `parameter-${input.key}`;
    if (input.input === "text") {
      return row(id, input.label, input.value, deviceFieldEditor(device, input.key));
    }
    const options = input.input === "checkbox" ? yesNoOptions(t) : input.options;
    const label = options.find((option) => option.value === input.value)?.label ?? input.value;
    return row(id, input.label, label, { input: "select", target, options, selected: input.value });
  });
}

function stateRows(sensor: Sensor, context: InspectorContext): PropertyRow[] {
  const labels = SENSOR_LABELS[sensor.type][context.language];
  return SENSOR_TAGS[sensor.type].map((tag) =>
    liveRow(tag.member, labels.tags[tag.member] ?? tag.member, {
      kind: "tag",
      tag: tagName(sensor.assembly, sensor.tagKey, tag.member),
      unit: null,
      format: tag.type === "bit" ? "bit" : "number",
    }),
  );
}

export function sensorGroups(sensor: Sensor, context: InspectorContext): GroupDraft[] {
  const { language, t } = context;
  const device: DeviceRef = { kind: "sensor", id: sensor.id };
  const parameters = parameterRows(sensor, context);
  return [
    {
      id: "general",
      rows: [
        deviceNameRow(device, sensor.name, t),
        row("type", t("drives.form.type"), SENSOR_LABELS[sensor.type][language].name),
        // The prefix of its tags: assembly key and tag key (ADR 0019).
        row("tagPrefix", t("inspector.tagPrefix"), `${sensor.assembly}.${sensor.tagKey}`),
      ],
    },
    ...(parameters.length === 0 ? [] : [{ id: "parameters" as const, rows: parameters }]),
    { id: "state", rows: stateRows(sensor, context) },
  ];
}
