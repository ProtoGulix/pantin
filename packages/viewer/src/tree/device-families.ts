import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import type { PantinDocument } from "@pantin/protocol";
import { PRESENCE_SENSOR_LABELS, SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { conveyorsOf } from "../conveyors/conveyor-kinds.ts";
import type { DeviceKind } from "../device-selection.ts";
import type { Language, MessageKey } from "../i18n/translate.ts";
import { formatDisplayNumber, metresToMillimetres } from "../units.ts";
import type { FamilyKey } from "./node-ids.ts";

// The registry of ADR 0047 point 6: every kind of element under an assembly
// is one entry here, grouped in three families. Adding a kind to the document
// means adding one entry; the test fails while a DeviceKind has none.

export type DeviceIcon =
  | "device-drive"
  | "device-actuator"
  | "device-sensor"
  | "device-belt"
  | "device-guide"
  | "device-emitter"
  | "device-absorber"
  | "device-presence-sensor";

// What every element of the document carries (ADR 0047 point 1).
interface DeviceElement {
  id: string;
  name: string;
  assembly: string;
  body?: string | undefined;
}

export interface DeviceContext {
  document: PantinDocument;
  language: Language;
}

export interface DeviceItem {
  id: string;
  name: string;
  detail: string | null;
}

export interface DeviceEntry {
  icon: DeviceIcon;
  // The kind in words ("Drive"), for screen readers.
  labelKey: MessageKey;
  read(document: PantinDocument): readonly DeviceElement[];
  // The elements of one assembly, in document order.
  items(context: DeviceContext, assemblyKey: string): DeviceItem[];
}

interface EntrySpec<Item extends DeviceElement> {
  icon: DeviceIcon;
  labelKey: MessageKey;
  read(document: PantinDocument): readonly Item[];
  detail(item: Item, context: DeviceContext): string | null;
}

// Closes over the item type, so that each kind's detail reads its own fields
// without a cast, and the registry holds one uniform type.
function entry<Item extends DeviceElement>(spec: EntrySpec<Item>): DeviceEntry {
  return {
    icon: spec.icon,
    labelKey: spec.labelKey,
    read: spec.read,
    items: (context, assemblyKey) =>
      spec
        .read(context.document)
        .filter((item) => item.assembly === assemblyKey)
        .map((item) => ({ id: item.id, name: item.name, detail: spec.detail(item, context) })),
  };
}

function millimetres(metres: number): string {
  return formatDisplayNumber(metresToMillimetres(metres));
}

function sizeText(size: readonly number[]): string {
  return `${size.map(millimetres).join(" × ")} mm`;
}

// An object placed on a body says which one: the body is optional (ADR 0043).
function onBody(detail: string | null, item: DeviceElement, context: DeviceContext): string | null {
  const body = context.document.bodies.find((candidate) => candidate.id === item.body);
  const parts = [detail, body?.name].filter((part) => part !== undefined && part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

const ENTRIES: Readonly<Record<DeviceKind, DeviceEntry>> = {
  drive: entry({
    icon: "device-drive",
    labelKey: "diagram.kind.drive",
    read: (document) => document.drives,
    detail: (drive, { language }) => DRIVE_LABELS[drive.type][language].name,
  }),
  actuator: entry({
    icon: "device-actuator",
    labelKey: "diagram.kind.actuator",
    read: (document) => document.actuators,
    detail: (actuator, { language }) => ACTUATOR_LABELS[actuator.type][language].name,
  }),
  sensor: entry({
    icon: "device-sensor",
    labelKey: "diagram.kind.sensor",
    read: (document) => document.sensors,
    detail: (sensor, { language }) => SENSOR_LABELS[sensor.type][language].name,
  }),
  belt: entry({
    icon: "device-belt",
    labelKey: "objects.kind.belt",
    read: (document) => conveyorsOf(document, "belt"),
    detail: (belt, context) => onBody(sizeText([belt.length, belt.width]), belt, context),
  }),
  guide: entry({
    icon: "device-guide",
    labelKey: "objects.kind.guide",
    read: (document) => conveyorsOf(document, "guide"),
    detail: (guide, context) => onBody(sizeText(guide.size), guide, context),
  }),
  presenceSensor: entry({
    icon: "device-presence-sensor",
    labelKey: "objects.kind.presenceSensor",
    read: (document) => conveyorsOf(document, "presenceSensor"),
    detail: (sensor, context) =>
      onBody(PRESENCE_SENSOR_LABELS[sensor.type][context.language].name, sensor, context),
  }),
  emitter: entry({
    icon: "device-emitter",
    labelKey: "objects.kind.emitter",
    read: (document) => conveyorsOf(document, "emitter"),
    detail: (emitter, context) => onBody(sizeText(emitter.box.size), emitter, context),
  }),
  absorber: entry({
    icon: "device-absorber",
    labelKey: "objects.kind.absorber",
    read: (document) => conveyorsOf(document, "absorber"),
    detail: (absorber, context) => onBody(sizeText(absorber.size), absorber, context),
  }),
};

export interface DeviceFamily {
  key: FamilyKey;
  labelKey: MessageKey;
  // In the order the folder lists them.
  kinds: readonly DeviceKind[];
}

export const DEVICE_FAMILIES: readonly DeviceFamily[] = [
  {
    key: "actionChain",
    labelKey: "tree.family.actionChain",
    kinds: ["drive", "actuator", "sensor"],
  },
  {
    key: "conveying",
    labelKey: "tree.family.conveying",
    kinds: ["belt", "guide", "presenceSensor"],
  },
  { key: "productFlow", labelKey: "tree.family.productFlow", kinds: ["emitter", "absorber"] },
];

export function deviceEntry(kind: DeviceKind): DeviceEntry {
  return ENTRIES[kind];
}

export function familyOfKind(kind: DeviceKind): FamilyKey | undefined {
  return DEVICE_FAMILIES.find((family) => family.kinds.includes(kind))?.key;
}

/** The devices of one family in one assembly: each kind in order, then document order. */
export function familyDevices(
  context: DeviceContext,
  family: DeviceFamily,
  assemblyKey: string,
): (DeviceItem & { kind: DeviceKind })[] {
  return family.kinds.flatMap((kind) =>
    ENTRIES[kind].items(context, assemblyKey).map((item) => ({ ...item, kind })),
  );
}

/** The assembly a device belongs to, or undefined when the document no longer has it. */
export function assemblyOfDevice(
  document: PantinDocument,
  kind: DeviceKind,
  id: string,
): string | undefined {
  return ENTRIES[kind].read(document).find((item) => item.id === id)?.assembly;
}

export function familyHasDevices(
  context: DeviceContext,
  family: DeviceFamily,
  assemblyKey: string,
): boolean {
  return familyDevices(context, family, assemblyKey).length > 0;
}
