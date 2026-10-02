import type { MessageKey } from "../i18n/translate.ts";
import type { PropertyGroupId } from "./property-rows.ts";

// The title of each group of the properties grid and of the inspector.
export const GROUP_TITLES: Readonly<Record<PropertyGroupId, MessageKey>> = {
  general: "properties.group.general",
  source: "properties.group.source",
  mesh: "properties.group.mesh",
  sourceNodes: "properties.group.sourceNodes",
  placement: "properties.group.placement",
  assemblyPlacement: "properties.group.assemblyPlacement",
  parameters: "properties.group.parameters",
  joints: "properties.group.joints",
  commands: "inspector.group.commands",
  feedback: "inspector.group.feedback",
  faults: "inspector.group.faults",
  state: "inspector.group.state",
  position: "inspector.group.position",
  links: "inspector.group.links",
  driveIndex: "drives.section",
  actuatorIndex: "actuators.title",
  sensorIndex: "sensors.title",
};
