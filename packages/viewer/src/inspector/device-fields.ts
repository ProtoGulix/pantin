import type { DeviceRef } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";
import { type PropertyRow, type RowEditor, row } from "../properties/property-rows.ts";

// Rows of a device's own fields (name, parameters), edited in place. Each
// edit is a "deviceField" target: the device form's field id and the typed
// text, validated by the same request builder as the form.

export function deviceFieldEditor(device: DeviceRef, fieldId: string): RowEditor {
  return { input: "text", target: { kind: "deviceField", device, fieldId } };
}

export function deviceNameRow(device: DeviceRef, name: string, t: Translate): PropertyRow {
  return row("name", t("properties.name"), name, deviceFieldEditor(device, "name"));
}

/** "Speed (mm/s)": the label with its unit when it has one. */
export function withUnit(label: string, unit: string | null): string {
  return unit === null ? label : `${label} (${unit})`;
}

export function yesNoOptions(t: Translate) {
  return [
    { value: "true", label: t("properties.yes") },
    { value: "false", label: t("properties.no") },
  ];
}
