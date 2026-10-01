import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import type { PantinDocument } from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { actuatorNode, driveNode, jointNode, sensorNode } from "./diagram-chains.ts";
import { endpointLabel } from "./diagram-link-targets.ts";
import type { ChainDiagram, DiagramEdge, DiagramNode, Socket } from "./diagram-types.ts";

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

// Anchors have no name on the box: what they link to is their name.
const ANCHOR_KEYS: Readonly<Record<string, MessageKey>> = {
  "joint:in": "diagram.port.jointIn",
  "joint:out": "diagram.port.jointOut",
  "actuator:out": "diagram.port.actuatorOut",
  "sensor:in": "diagram.port.sensorIn",
};

/** The accessible name of a port: its side and its name, or what its anchor links to. */
export function portLabel(node: DiagramNode, socket: Socket, t: Translate): string {
  if (socket.role === "output" || socket.role === "input") {
    return t(`diagram.port.${socket.role}`, { name: socket.label });
  }
  const key = ANCHOR_KEYS[`${node.kind}:${socket.id}`];
  return key === undefined ? socket.label : t(key);
}

/** The accessible name of an edge: its domain and both ends, "Pneumatic link: V1 · Port 4 → Cyl · Cap chamber". */
export function edgeDescription(diagram: ChainDiagram, edge: DiagramEdge, t: Translate): string {
  const from = endpointLabel(diagram, { nodeId: edge.fromNode, socketId: edge.fromSocket });
  const to = endpointLabel(diagram, { nodeId: edge.toNode, socketId: edge.toSocket });
  return `${t(`diagram.edge.${edge.kind}`)}: ${from} → ${to}`;
}

/** The keys of the diagram, for the list of keyboard shortcuts of the welcome dialog. */
export function diagramShortcuts(t: Translate): { keys: string; action: string }[] {
  return [
    { keys: t("diagram.shortcut.arrows.keys"), action: t("diagram.shortcut.arrows.action") },
    { keys: t("diagram.shortcut.enter.keys"), action: t("diagram.shortcut.enter.action") },
    { keys: t("diagram.shortcut.space.keys"), action: t("diagram.shortcut.space.action") },
    { keys: t("diagram.shortcut.escape.keys"), action: t("diagram.shortcut.escape.action") },
    { keys: t("diagram.shortcut.home.keys"), action: t("diagram.shortcut.home.action") },
    { keys: t("shortcut.delete"), action: t("diagram.shortcut.delete.action") },
  ];
}
