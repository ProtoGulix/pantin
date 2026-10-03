import type { PantinResponse } from "@pantin/protocol";
import { movableJoints } from "../actuators/actuator-joints.ts";
import type { DeviceRef } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";
import { buildJointSlider, type JointSliderSpec } from "../joints/slider-model.ts";
import { type ActuatorFormView, buildActuatorFormView } from "../panel/actuator-form-model.ts";
import { buildDriveFormView, type DriveFormView } from "../panel/drive-form-model.ts";
import { buildJointFormView, type JointFormView } from "../panel/joint-form-model.ts";
import { buildSensorFormView, type SensorFormView } from "../panel/sensor-form-model.ts";
import { GROUP_TITLES } from "../properties/group-titles.ts";
import { type LiveSource, liveKey, type PropertyGroup } from "../properties/property-rows.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import type { InspectorFocusRequest, ViewerState } from "../viewer-state.ts";
import { actuatorGroups } from "./actuator-inspector.ts";
import { driveGroups } from "./drive-inspector.ts";
import { type InspectorContent, type InspectorContext, NOTHING } from "./inspector-context.ts";
import { nodeInspectorContent } from "./node-inspector.ts";
import { buildPositioningView, type PositioningView } from "./positioning-view.ts";
import { sensorGroups } from "./sensor-inspector.ts";

// The right-hand panel as data (ADR 0030 point 2): the only properties panel,
// the inspector of what is selected, as a "Property | Value" grid under the
// buttons that create devices. A device gets its own fields; a tree node its
// properties (inspector/node-inspector.ts), with a joint's live state and
// links, or the index of the devices of the Pantin or an assembly.

export interface InspectorView {
  open: boolean;
  title: string;
  // What the grid below is about; null when nothing in it needs naming.
  subject: string | null;
  // The selected device, for its Edit and Delete buttons.
  device: DeviceRef | null;
  canCreateActuator: boolean;
  canCreateSensor: boolean;
  // The forms stay the way to create a device or a joint, and to change a
  // type; the joint's slider moves it, when it can move.
  jointForm: JointFormView | null;
  jointSlider: JointSliderSpec | null;
  driveForm: DriveFormView | null;
  actuatorForm: ActuatorFormView | null;
  sensorForm: SensorFormView | null;
  // The "Positionnement" section (ADR 0039), above the groups; null when the
  // selection cannot be placed.
  positioning: PositioningView | null;
  groups: PropertyGroup[];
  // Said instead of an empty grid.
  note: string | null;
  // Under the index: what a family without device is for.
  hints: string[];
  // The live cells of the grid, by liveKey.
  live: ReadonlyMap<string, LiveSource>;
  // F2: the field to focus, served once per serial (ui/inspector.ts).
  focusRequest: InspectorFocusRequest | null;
}

function find<Item extends { id: string }>(items: readonly Item[], id: string): Item | null {
  return items.find((item) => item.id === id) ?? null;
}

function deviceView(device: DeviceRef, context: InspectorContext): InspectorContent | null {
  const { document } = context.pantin;
  const { t } = context;
  const label = t(`diagram.kind.${device.kind}`);
  switch (device.kind) {
    case "drive": {
      const drive = find(document.drives, device.id);
      return drive === null
        ? null
        : { subject: `${label} · ${drive.name}`, groups: driveGroups(drive, context), hints: [] };
    }
    case "actuator": {
      const actuator = find(document.actuators, device.id);
      return actuator === null
        ? null
        : {
            subject: `${label} · ${actuator.name}`,
            groups: actuatorGroups(actuator, context),
            hints: [],
          };
    }
    case "sensor": {
      const sensor = find(document.sensors, device.id);
      return sensor === null
        ? null
        : {
            subject: `${label} · ${sensor.name}`,
            groups: sensorGroups(sensor, context),
            hints: [],
          };
    }
  }
}

function contentOf(state: ViewerState, context: InspectorContext): InspectorContent {
  const { selection } = state;
  if (selection === null) {
    return NOTHING;
  }
  return selection.kind === "node"
    ? nodeInspectorContent(state, selection.nodeId, context)
    : (deviceView(selection, context) ?? NOTHING);
}

function selectedJointSlider(state: ViewerState, pantin: PantinResponse): JointSliderSpec | null {
  const nodeId = selectedNodeIdOf(state.selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  const joint =
    ref?.kind === "joint"
      ? pantin.document.joints.find((candidate) => candidate.id === ref.jointId)
      : undefined;
  return joint === undefined ? null : buildJointSlider(pantin.id, joint);
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
    title: t("inspector.title"),
    subject: null,
    device: null,
    canCreateActuator: false,
    canCreateSensor: false,
    jointForm: null,
    jointSlider: null,
    driveForm: null,
    actuatorForm: null,
    sensorForm: null,
    positioning: null,
    groups: [],
    note: null,
    hints: [],
    live: new Map(),
    focusRequest: null,
  };
}

export function buildInspectorView(state: ViewerState, t: Translate): InspectorView {
  const pantin = state.openPantin;
  if (pantin === null || !state.inspectorOpen) {
    return emptyInspector(t);
  }
  const context: InspectorContext = { pantin, language: state.language, faults: state.faults, t };
  const content = contentOf(state, context);
  const slider = selectedJointSlider(state, pantin);
  const groups = content.groups.map((draft) => ({
    ...draft,
    title: t(GROUP_TITLES[draft.id]),
    collapsed: state.collapsedPropertyGroups.has(draft.id),
  }));
  const { document } = pantin;
  const canMove = movableJoints(document).length > 0;
  return {
    open: true,
    title: t("inspector.title"),
    subject: content.subject,
    device: selectedDeviceOf(state.selection),
    jointForm: buildJointFormView(state, t),
    jointSlider: slider,
    canCreateActuator: canMove,
    canCreateSensor: canMove,
    driveForm: buildDriveFormView(state, document, t),
    actuatorForm: buildActuatorFormView(state, document, t),
    sensorForm: buildSensorFormView(state, document, t),
    positioning: buildPositioningView(state, t),
    groups,
    note: groups.length === 0 && content.hints.length === 0 ? t("inspector.empty") : null,
    hints: content.hints.map((hint) => t(hint)),
    live: liveSourcesOf(groups),
    focusRequest: state.inspectorFocus,
  };
}
