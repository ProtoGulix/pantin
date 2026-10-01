import { movableJoints } from "../actuators/actuator-joints.ts";
import type { DeviceRef } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";
import { type ActuatorFormView, buildActuatorFormView } from "../panel/actuator-form-model.ts";
import { buildDriveFormView, type DriveFormView } from "../panel/drive-form-model.ts";
import { buildSensorFormView, type SensorFormView } from "../panel/sensor-form-model.ts";
import { GROUP_TITLES } from "../properties/group-titles.ts";
import {
  type GroupDraft,
  type LiveSource,
  liveKey,
  type PropertyGroup,
} from "../properties/property-rows.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import type { ViewerState } from "../viewer-state.ts";
import { actuatorGroups } from "./actuator-inspector.ts";
import { driveGroups } from "./drive-inspector.ts";
import type { InspectorContext } from "./inspector-context.ts";
import { jointInspectorGroups } from "./joint-inspector.ts";
import { scopeIndexGroups } from "./scope-index.ts";
import { sensorGroups } from "./sensor-inspector.ts";

// The right-hand panel as data (ADR 0030 point 2, first step): the inspector
// of what is selected, as a "Property | Value" grid, under the buttons that
// create devices. A device gets its own fields, a joint its live state and
// links, the Pantin and an assembly an index of their devices. A body or the
// "between assemblies" folder have nothing to show but the buttons.

export interface InspectorView {
  open: boolean;
  title: string;
  // What the grid below is about; null when nothing in it needs naming.
  subject: string | null;
  // The selected device, for its Edit and Delete buttons.
  device: DeviceRef | null;
  canCreateActuator: boolean;
  canCreateSensor: boolean;
  // The forms stay the way to create a device, and to change its type.
  driveForm: DriveFormView | null;
  actuatorForm: ActuatorFormView | null;
  sensorForm: SensorFormView | null;
  groups: PropertyGroup[];
  // Said instead of an empty grid.
  note: string | null;
  // The live cells of the grid, by liveKey.
  live: ReadonlyMap<string, LiveSource>;
}

function find<Item extends { id: string }>(items: readonly Item[], id: string): Item | null {
  return items.find((item) => item.id === id) ?? null;
}

function deviceView(device: DeviceRef, context: InspectorContext) {
  const { document } = context.pantin;
  const { t } = context;
  const label = t(`diagram.kind.${device.kind}`);
  switch (device.kind) {
    case "drive": {
      const drive = find(document.drives, device.id);
      return drive === null
        ? null
        : { subject: `${label} · ${drive.name}`, groups: driveGroups(drive, context) };
    }
    case "actuator": {
      const actuator = find(document.actuators, device.id);
      return actuator === null
        ? null
        : { subject: `${label} · ${actuator.name}`, groups: actuatorGroups(actuator, context) };
    }
    case "sensor": {
      const sensor = find(document.sensors, device.id);
      return sensor === null
        ? null
        : { subject: `${label} · ${sensor.name}`, groups: sensorGroups(sensor, context) };
    }
  }
}

interface Content {
  subject: string | null;
  groups: GroupDraft[];
}

const NOTHING: Content = { subject: null, groups: [] };

function treeNodeContent(nodeId: string, context: InspectorContext): Content {
  const { pantin, t } = context;
  const ref = parseNodeId(nodeId);
  if (ref === null || ref.pantinId !== pantin.id) {
    return NOTHING;
  }
  if (ref.kind === "pantin") {
    return { subject: pantin.document.name, groups: scopeIndexGroups(context, null) };
  }
  if (ref.kind === "assembly") {
    const assembly = pantin.document.assemblies.find((candidate) => candidate.key === ref.key);
    return assembly === undefined
      ? NOTHING
      : { subject: assembly.name, groups: scopeIndexGroups(context, assembly.key) };
  }
  if (ref.kind === "joint") {
    const joint = pantin.document.joints.find((candidate) => candidate.id === ref.jointId);
    return joint === undefined
      ? NOTHING
      : {
          subject: `${t("diagram.kind.joint")} · ${joint.name}`,
          groups: jointInspectorGroups(joint, context),
        };
  }
  return NOTHING;
}

function contentOf(state: ViewerState, context: InspectorContext): Content {
  if (state.selectedDevice !== null) {
    return deviceView(state.selectedDevice, context) ?? NOTHING;
  }
  return state.selectedNodeId === null ? NOTHING : treeNodeContent(state.selectedNodeId, context);
}

function liveSourcesOf(groups: readonly PropertyGroup[]): Map<string, LiveSource> {
  const sources = new Map<string, LiveSource>();
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.live !== null) {
        sources.set(liveKey(group.id, row.id), row.live);
      }
    }
  }
  return sources;
}

function emptyInspector(t: Translate): InspectorView {
  return {
    open: false,
    title: t("drives.title"),
    subject: null,
    device: null,
    canCreateActuator: false,
    canCreateSensor: false,
    driveForm: null,
    actuatorForm: null,
    sensorForm: null,
    groups: [],
    note: null,
    live: new Map(),
  };
}

export function buildInspectorView(state: ViewerState, t: Translate): InspectorView {
  const pantin = state.openPantin;
  if (pantin === null || !state.drivePanelOpen) {
    return emptyInspector(t);
  }
  const context: InspectorContext = { pantin, language: state.language, faults: state.faults, t };
  const content = contentOf(state, context);
  const groups = content.groups.map((draft) => ({
    ...draft,
    title: t(GROUP_TITLES[draft.id]),
    collapsed: state.collapsedPropertyGroups.has(draft.id),
  }));
  const { document } = pantin;
  const canMove = movableJoints(document).length > 0;
  return {
    open: true,
    title: t("drives.title"),
    subject: content.subject,
    device: state.selectedDevice,
    canCreateActuator: canMove,
    canCreateSensor: canMove,
    driveForm: buildDriveFormView(state, document, t),
    actuatorForm: buildActuatorFormView(state, document, t),
    sensorForm: buildSensorFormView(state, document, t),
    groups,
    note: groups.length === 0 ? t("inspector.empty") : null,
    live: liveSourcesOf(groups),
  };
}
