import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { DRIVE_TAGS, SENSOR_TAGS, tagName } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { deviceLinkRow, type GroupDraft } from "../properties/property-rows.ts";
import type { InspectorContext } from "./inspector-context.ts";

// The index of the devices of the Pantin or of one assembly (ADR 0030 point
// 2): one line per drive, actuator and sensor, with its name, its type and its
// state; a line selects its device. The lit commands and the sensor state are
// live cells: the page fills them after every tag read.

/**
 * The groups of the index; `assemblyKey` limits it to one assembly, null
 * lists every device of the Pantin.
 */
export function scopeIndexGroups(
  context: InspectorContext,
  assemblyKey: string | null,
): GroupDraft[] {
  const { pantin, language } = context;
  const inScope = (device: { assembly: string }) =>
    assemblyKey === null || device.assembly === assemblyKey;
  const drives = pantin.document.drives.filter(inScope).map((drive) => {
    const labels = DRIVE_LABELS[drive.type][language];
    const commands = DRIVE_TAGS[drive.type]
      .filter((tag) => tag.direction === "command" && tag.type === "bit")
      .map((tag) => ({
        tag: tagName(drive.assembly, drive.tagKey, tag.member),
        label: labels.tags[tag.member] ?? tag.member,
      }));
    return {
      ...deviceLinkRow(drive.id, drive.name, labels.name, { kind: "drive", id: drive.id }),
      live: { kind: "driveStatus", driveId: drive.id, driveType: drive.type, commands } as const,
    };
  });
  const actuators = pantin.document.actuators.filter(inScope).map((actuator) =>
    deviceLinkRow(actuator.id, actuator.name, ACTUATOR_LABELS[actuator.type][language].name, {
      kind: "actuator",
      id: actuator.id,
    }),
  );
  const sensors = pantin.document.sensors.filter(inScope).map((sensor) => {
    const state = SENSOR_TAGS[sensor.type][0];
    const link = deviceLinkRow(sensor.id, sensor.name, SENSOR_LABELS[sensor.type][language].name, {
      kind: "sensor",
      id: sensor.id,
    });
    return state === undefined
      ? link
      : {
          ...link,
          live: {
            kind: "tag",
            tag: tagName(sensor.assembly, sensor.tagKey, state.member),
            unit: null,
            format: state.type === "bit" ? "bit" : "number",
          } as const,
        };
  });
  const groups: GroupDraft[] = [
    { id: "driveIndex", rows: drives },
    { id: "actuatorIndex", rows: actuators },
    { id: "sensorIndex", rows: sensors },
  ];
  return groups.filter((group) => group.rows.length > 0);
}
