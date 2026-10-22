import type { IoMappedChannel, IoMappingModule } from "@pantin/protocol";
import { TRANSPORT_LABELS } from "@pantin/transport-types/labels";
import {
  CHANNEL_KEY_BY_KIND,
  OPCUA_CLIENT_KIND,
  TRANSPORT_KINDS,
  type TransportKind,
  WORD_ORDERS,
} from "@pantin/transport-types/schemas";
import type { Language } from "../i18n/translate.ts";
import { OPCUA_VIEW, opcuaSubtitle } from "./opcua-view.ts";
import type { SettingInput, SettingSpec, TransportViewSpec } from "./transport-view-spec.ts";

// What the I/O view shows of a module depends on its transport (ADR 0064 point 14). The words come
// from the transport's labels; this table only says which settings and channel fields a kind has
// and how each is edited, since the labels do not carry that. It is keyed by the registry's kinds,
// so a new transport does not compile until it has an entry here.

const TRANSPORT_VIEWS: Readonly<Record<TransportKind, TransportViewSpec>> = {
  modbus_tcp_slave: {
    endpointSettings: ["port", "unitId"],
    settings: [
      { name: "port", input: "integer" },
      { name: "unitId", input: "integer" },
      { name: "wordOrder", input: "choice", options: WORD_ORDERS },
      { name: "watchdogMilliseconds", input: "integer" },
    ],
    channelFields: ["zone", "address", "ioType"],
    placeFields: ["zone", "address"],
    editableChannelFields: ["address"],
  },
  opcua_client: OPCUA_VIEW,
};

export interface IoSettingView {
  name: string;
  label: string;
  value: string;
  input: SettingInput;
  options: readonly { value: string; label: string }[];
}

export interface IoColumnView {
  field: string;
  label: string;
}

export interface IoChannelCell {
  field: string;
  text: string;
  editable: boolean;
}

export interface IoKindChoice {
  kind: TransportKind;
  label: string;
}

const labelsOf = (kind: TransportKind, language: Language) => TRANSPORT_LABELS[kind][language];

function settingValue(module: IoMappingModule, name: string): string {
  const custom = settingSpecOf(module.transport.kind, name)?.readFrom;
  if (custom !== undefined) {
    return custom(module.transport);
  }
  const value = Object.entries(module.transport).find(([key]) => key === name)?.[1];
  return value === undefined ? "" : String(value);
}

/** "Modbus TCP esclave · Port 1502 · Adresse d'unité 1": the transport's name, then its endpoint. */
export function moduleSubtitle(module: IoMappingModule, language: Language): string {
  const { kind } = module.transport;
  if (kind === OPCUA_CLIENT_KIND) {
    return opcuaSubtitle(module.transport, language);
  }
  const labels = labelsOf(kind, language);
  const endpoint = TRANSPORT_VIEWS[kind].endpointSettings.map((name) => {
    const value = settingValue(module, name);
    return `${labels.settings[name] ?? name} ${labels.values[value] ?? value}`;
  });
  return [labels.name, ...endpoint].join(" · ");
}

export function moduleSettings(module: IoMappingModule, language: Language): IoSettingView[] {
  const { kind } = module.transport;
  const labels = labelsOf(kind, language);
  return TRANSPORT_VIEWS[kind].settings.map((spec) => ({
    name: spec.name,
    label: labels.settings[spec.name] ?? spec.name,
    value: settingValue(module, spec.name),
    input: spec.input,
    options: (spec.options ?? []).map((value) => ({ value, label: labels.values[value] ?? value })),
  }));
}

/** The transport columns of a module's table (zone, address, type for Modbus). */
export function channelColumns(kind: TransportKind, language: Language): IoColumnView[] {
  const labels = labelsOf(kind, language);
  return TRANSPORT_VIEWS[kind].channelFields.map((field) => ({
    field,
    label: labels.channelFields[field] ?? field,
  }));
}

/** The cells of a channel under the transport columns, in the same order. */
export function channelCells(
  kind: TransportKind,
  channel: IoMappedChannel,
  language: Language,
): IoChannelCell[] {
  const labels = labelsOf(kind, language);
  const spec = TRANSPORT_VIEWS[kind];
  const fields = channel[CHANNEL_KEY_BY_KIND[kind]];
  const entries: [string, unknown][] = fields === undefined ? [] : Object.entries(fields);
  return spec.channelFields.map((field) => {
    const value = entries.find(([name]) => name === field)?.[1];
    const raw = spec.channelValueKey?.(field, value) ?? (value === undefined ? "" : String(value));
    return {
      field,
      text: labels.values[raw] ?? raw,
      editable: spec.editableChannelFields.includes(field),
    };
  });
}

/** Where a channel sits in its module, in the transport's words: "Bobine 7". */
export function channelPlace(
  kind: TransportKind,
  channel: IoMappedChannel,
  language: Language,
): string {
  const { placeFields } = TRANSPORT_VIEWS[kind];
  return channelCells(kind, channel, language)
    .filter((cell) => placeFields.includes(cell.field))
    .map((cell) => cell.text)
    .join(" ");
}

/** What the registry offers when a module is created. */
export function creatableKinds(language: Language): IoKindChoice[] {
  return TRANSPORT_KINDS.map((kind) => ({ kind, label: labelsOf(kind, language).name }));
}

export function settingSpecOf(kind: TransportKind, field: string): SettingSpec | undefined {
  return TRANSPORT_VIEWS[kind].settings.find((spec) => spec.name === field);
}

export function isEditableChannelField(kind: TransportKind, field: string): boolean {
  return TRANSPORT_VIEWS[kind].editableChannelFields.includes(field);
}

/** The words of a setting or channel field, for a message that names it. */
export function fieldLabel(kind: TransportKind, field: string, language: Language): string {
  const labels = labelsOf(kind, language);
  return labels.settings[field] ?? labels.channelFields[field] ?? field;
}
