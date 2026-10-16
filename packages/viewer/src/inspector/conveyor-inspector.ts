import { PRESENCE_SENSOR_TAGS, tagName } from "@pantin/protocol";
import { PRESENCE_SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { conveyorFormOf } from "../conveyors/conveyor-form.ts";
import { type ConveyorKind, findConveyor, SPAWN_MEMBER } from "../conveyors/conveyor-kinds.ts";
import type { DeviceRef } from "../device-selection.ts";
import { type ConveyorInputView, conveyorInputs } from "../panel/conveyor-form-model.ts";
import { PLACEMENT_FIELDS } from "../placement-units.ts";
import { placementFieldLabel } from "../properties/placement-groups.ts";
import { type GroupDraft, liveRow, type PropertyRow, row } from "../properties/property-rows.ts";
import {
  DEVICE_NAME_GROUP,
  deviceFieldEditor,
  deviceNameRow,
  yesNoOptions,
} from "./device-fields.ts";
import type { InspectorContent, InspectorContext } from "./inspector-context.ts";

// The inspector of a belt, guide, emitter, absorber or presence sensor (ADR
// 0043 point 13): its frame, its placement and its sizes, edited in place like
// a device's parameters, and its live tag. The rows come from the same form
// model as the creation form, so that a typed text means the same in both.

function inputRow(device: DeviceRef, input: ConveyorInputView, context: InspectorContext) {
  const id = `parameter-${input.key}`;
  if (input.input === "text") {
    return row(id, input.label, input.value, deviceFieldEditor(device, input.key));
  }
  const options = input.input === "checkbox" ? yesNoOptions(context.t) : input.options;
  const label = options.find((option) => option.value === input.value)?.label ?? input.value;
  const target = { kind: "deviceField", device, fieldId: input.key } as const;
  return row(id, input.label, label, {
    input: "select",
    target,
    options,
    selected: input.value,
  });
}

function placementRows(
  device: DeviceRef,
  values: Readonly<Record<string, string>>,
  context: InspectorContext,
) {
  return PLACEMENT_FIELDS.map((field, index) => {
    const next = PLACEMENT_FIELDS[index + 1];
    return {
      ...row(
        `placement-${field}`,
        placementFieldLabel(field, context.t),
        values[field] ?? "",
        deviceFieldEditor(device, field),
      ),
      ...(next === undefined ? {} : { nextFocusKey: `property-placement-${next}` }),
    };
  });
}

function stateRows(kind: ConveyorKind, id: string, context: InspectorContext): PropertyRow[] {
  const { document } = context.pantin;
  const { language, t } = context;
  if (kind === "emitter") {
    const emitter = findConveyor(document, "emitter", id);
    return emitter === undefined
      ? []
      : [
          liveRow(SPAWN_MEMBER, t("conveyors.tag.spawn"), {
            kind: "tag",
            tag: tagName(emitter.assembly, emitter.tagKey, SPAWN_MEMBER),
            unit: null,
            format: "bit",
          }),
        ];
  }
  const sensor = kind === "presenceSensor" ? findConveyor(document, kind, id) : undefined;
  if (sensor === undefined) {
    return [];
  }
  const labels = PRESENCE_SENSOR_LABELS[sensor.type][language];
  return PRESENCE_SENSOR_TAGS[sensor.type].map((tag) =>
    liveRow(tag.member, labels.tags[tag.member] ?? tag.member, {
      kind: "tag",
      tag: tagName(sensor.assembly, sensor.tagKey, tag.member),
      unit: null,
      format: tag.type === "bit" ? "bit" : "number",
    }),
  );
}

function typeLabel(kind: ConveyorKind, id: string, context: InspectorContext): string {
  const sensor =
    kind === "presenceSensor" ? findConveyor(context.pantin.document, kind, id) : undefined;
  return sensor === undefined
    ? context.t(`objects.kind.${kind}`)
    : PRESENCE_SENSOR_LABELS[sensor.type][context.language].name;
}

function tagPrefixOf(kind: ConveyorKind, id: string, context: InspectorContext): string | null {
  const { document } = context.pantin;
  const owner =
    kind === "emitter" || kind === "presenceSensor" ? findConveyor(document, kind, id) : undefined;
  return owner === undefined ? null : `${owner.assembly}.${owner.tagKey}`;
}

function groupsOf(kind: ConveyorKind, id: string, context: InspectorContext): GroupDraft[] {
  const { pantin, language, t } = context;
  const { document } = pantin;
  const form = conveyorFormOf(document, kind, id);
  if (form === null) {
    return [];
  }
  const device: DeviceRef = { kind, id };
  const prefix = tagPrefixOf(kind, id, context);
  const state = stateRows(kind, id, context);
  const bodyName = document.bodies.find((body) => body.id === form.body)?.name;
  const assemblyName = document.assemblies.find((a) => a.key === form.assembly)?.name;
  return [
    {
      id: DEVICE_NAME_GROUP,
      rows: [
        deviceNameRow(device, form.name, t),
        row("type", t("drives.form.type"), typeLabel(kind, id, context)),
        ...(prefix === null ? [] : [row("tagPrefix", t("inspector.tagPrefix"), prefix)]),
      ],
    },
    {
      id: "conveyorFrame",
      rows: [
        row("assembly", t("conveyors.row.assembly"), assemblyName ?? form.assembly),
        row("body", t("conveyors.row.body"), bodyName ?? t("conveyors.row.noBody")),
      ],
    },
    { id: "conveyorPlacement", rows: placementRows(device, form.values, context) },
    {
      id: "parameters",
      rows: conveyorInputs(form, document, language, t).map((input) =>
        inputRow(device, input, context),
      ),
    },
    ...(state.length === 0 ? [] : [{ id: "state" as const, rows: state }]),
  ];
}

export function conveyorInspectorContent(
  kind: ConveyorKind,
  id: string,
  context: InspectorContext,
): InspectorContent | null {
  if (findConveyor(context.pantin.document, kind, id) === undefined) {
    return null;
  }
  const name = findConveyor(context.pantin.document, kind, id)?.name ?? id;
  return {
    subject: `${context.t(`objects.kind.${kind}`)} · ${name}`,
    groups: groupsOf(kind, id, context).filter((group) => group.rows.length > 0),
    hints: [],
  };
}
