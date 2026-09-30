import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import type { PantinDocument } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import type { Language, Translate } from "../i18n/translate.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { actuatorNode, driveNode, jointNode, sensorNode } from "./diagram-chains.ts";

// The words of the diagram that depend on the document: translated type labels.

/** The translated type of each node, by node id, read from the typed elements. */
export function nodeTypeLabels(
  document: PantinDocument,
  language: Language,
  t: Translate,
): Map<string, string> {
  return new Map([
    ...document.drives.map(
      (drive) => [driveNode(drive.id), DRIVE_LABELS[drive.type][language].name] as const,
    ),
    ...document.actuators.map(
      (actuator) =>
        [actuatorNode(actuator.id), ACTUATOR_LABELS[actuator.type][language].name] as const,
    ),
    ...document.joints.map(
      (joint) => [jointNode(joint.id), t(jointTypeLabelKey(joint.type))] as const,
    ),
    ...document.sensors.map(
      (sensor) => [sensorNode(sensor.id), SENSOR_LABELS[sensor.type][language].name] as const,
    ),
  ]);
}

// Average width of a character of the 11 px UI font, in diagram units: a
// text measure would need a DOM, and the tooltip carries the full text anyway.
const CHARACTER_WIDTH = 6.2;

/** The label cut to fit a width, with an ellipsis; the full label goes in a tooltip. */
export function truncateLabel(label: string, width: number): string {
  const capacity = Math.max(1, Math.floor(width / CHARACTER_WIDTH));
  const characters = [...label];
  return characters.length <= capacity ? label : `${characters.slice(0, capacity - 1).join("")}…`;
}
