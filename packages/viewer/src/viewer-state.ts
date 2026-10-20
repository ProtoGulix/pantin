import type {
  FaultsResponse,
  OrphanMeshList,
  PantinResponse,
  PantinSummary,
  RedundantJointsList,
} from "@pantin/protocol";
import { type AboutState, CLOSED_ABOUT } from "./about-state.ts";
import type { ActuatorFormState } from "./actuators/actuator-form.ts";
import type { AlignmentSession } from "./alignment/alignment-session.ts";
import { type AssemblyDisplay, NO_ASSEMBLY_DISPLAY } from "./assembly-display.ts";
import { type CentralLayout, DEFAULT_CENTRAL_LAYOUT } from "./central-layout.ts";
import { type ConsoleState, INITIAL_CONSOLE_STATE } from "./console/console-state.ts";
import type { ConveyorFormState } from "./conveyors/conveyor-form.ts";
import type { DriveFormState } from "./drives/drive-form.ts";
import type { GizmoSpace } from "./gizmo/gizmo-space.ts";
import { DEFAULT_SNAP_STEPS, type DragKind, type SnapSteps } from "./gizmo/placement-snapping.ts";
import type { PendingGroup } from "./grouping/grouping-model.ts";
import type { Language } from "./i18n/translate.ts";
import type { PendingImport } from "./import-options.ts";
import { type IoState, NO_IO_STATE } from "./io/io-state.ts";
import type { AxisPickState } from "./joints/axis-pick-state.ts";
import type { JointFormState } from "./joints/joint-form.ts";
import {
  DEFAULT_INSPECTOR_PREFERENCES,
  type InspectorPreferences,
  preferencesState,
} from "./layout-preferences.ts";
import type { PanelMessage } from "./messages.ts";
import { DEFAULT_NAVIGATION, type NavigationSettings } from "./navigation/navigation-settings.ts";
import type { PendingDeviceDeletion } from "./pending-device-deletion.ts";
import type { InvalidPlacementText, PlacementDraft } from "./placement-feedback.ts";
import { NO_PREVIOUS_PLACEMENTS, type PreviousPlacements } from "./previous-placement.ts";
import { nodeSelection, type Selection } from "./selection.ts";
import type { SensorFormState } from "./sensors/sensor-form.ts";
import type { ThemeChoice } from "./theme/theme.ts";
import { assemblyNodeId, folderNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { selectionExists, withMultiSelectionPruned } from "./tree/tree-state.ts";
import type {
  ContextMenuState,
  InspectorFocusRequest,
  PendingAssemblyDeletion,
  PendingDiagramLink,
} from "./viewer-state-parts.ts";

// Everything the viewer shows, as plain data. The core stays the source of
// truth: this is only the last answer it gave, plus purely local UI state.

export type WelcomeTab = "home" | "all";

export interface ViewerState {
  language: Language;
  // The chosen theme, "system" by default (ADR 0053); the resolved one lives on the page.
  themeChoice: ThemeChoice;
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
  expandedNodeIds: ReadonlySet<string>;
  selection: Selection | null;
  // The tree's multi-selection (ADR 0055 point 12): empty, or the selected node
  // first, then the others. Display state, never saved.
  multiSelectedNodeIds: readonly string[];
  renamingNodeId: string | null;
  collapsedPropertyGroups: ReadonlySet<string>;
  // Joints whose axis the user chose to type as components in the properties
  // grid, although it is still along X, Y or Z: display state only.
  customAxisJointIds: ReadonlySet<string>;
  creatingPantin: boolean;
  contextMenu: ContextMenuState | null;
  pendingImport: PendingImport | null;
  // True from the click on Import until the core answers; a STEP conversion
  // can take up to two minutes (ADR 0009), and a second submission is refused.
  importInProgress: boolean;
  // Number of requests in flight; actions are disabled while it is not zero.
  pendingRequestCount: number;
  message: PanelMessage | null;
  // "All Pantins" tab: the Pantin highlighted in the list, not opened yet.
  listSelectedPantinId: string | null;
  // The welcome dialog (ADR 0027), shown while no Pantin is open: hidden by
  // the user, the tab shown, and the filter typed in "All Pantins". Never persisted.
  welcomeHidden: boolean;
  welcomeTab: WelcomeTab;
  welcomeFilter: string;
  // The About window of the Help menu (ADR 0058).
  about: AboutState;
  // Edit view: closing with unsaved changes waits for the user's choice.
  closePrompt: boolean;
  // The close prompt also says that the PLC bridge keeps running (ADR 0050 point 7).
  closeBridgeNotice: boolean;
  // The box "Also stop the bridge" of that prompt, checked by default.
  closeStopsBridge: boolean;
  // Edit view: a body, then a joint, waiting for the user to confirm its deletion.
  pendingDeleteBodyId: string | null;
  pendingDeleteJointId: string | null;
  // A drive, an actuator or a sensor waiting for confirmation, with what the core would refuse.
  pendingDeleteDevice: PendingDeviceDeletion | null;
  // Same for an assembly (ADR 0037): the core's preview of what goes with it.
  pendingDeleteAssembly: PendingAssemblyDeletion | null;
  // "Grouper…" waiting for the group's name (ADR 0055 point 12).
  pendingGroup: PendingGroup | null;
  // What the core listed for a cleanup, waiting for the user to confirm: orphan
  // mesh files (ADR 0038), then redundant fixed joints (ADR 0060).
  pendingOrphanCleanup: OrphanMeshList | null;
  pendingRedundantJoints: RedundantJointsList | null;
  // The open "New joint" form, or null.
  jointForm: JointFormState | null;
  // Hidden and isolated assemblies of the 3D view (ADR 0019): never saved.
  assemblyDisplay: AssemblyDisplay;
  // The inspector on the right (ADR 0022, 0030), its form, and the faults the
  // core reported last.
  inspectorOpen: boolean;
  driveForm: DriveFormState | null;
  // The actuator form of the same panel (ADR 0028).
  actuatorForm: ActuatorFormState | null;
  // The sensor form of the same panel (ADR 0023).
  sensorForm: SensorFormState | null;
  // The form of a belt, guide, emitter, absorber or presence sensor (ADR 0043 point 13).
  conveyorForm: ConveyorFormState | null;
  faults: FaultsResponse;
  // The I/O view (ADR 0049 point 11): the last mapping the core answered.
  io: IoState;
  // What the central area shows (ADR 0030 point 7): a setting of the viewer,
  // kept in the browser and not reset by opening a Pantin. Then the diagram
  // bands the user folded: display state only, never saved.
  centralLayout: CentralLayout;
  collapsedDiagramBands: ReadonlySet<string>;
  pendingFeedReplacement: PendingDiagramLink | null;
  // F2 on a device: the inspector's field to focus. The serial makes asking
  // twice for the same key a new request, since a redraw must not refocus.
  inspectorFocus: InspectorFocusRequest | null;
  // The Pantin console at the bottom of the central area (ADR 0031).
  console: ConsoleState;
  // The placement gizmo (ADR 0034): what it does while on, and its steps, a
  // setting of the viewer kept in the browser. Display state, never saved.
  gizmoMode: DragKind | null;
  gizmoSteps: SnapSteps;
  // Which axes the gizmo offers (ADR 0042 point 2), also kept in the browser.
  gizmoSpace: GizmoSpace;
  // The alignment (ADR 0035), the axis pick (ADR 0041) or "Normal To" (ADR 0036) under way. Display state.
  alignment: AlignmentSession | null;
  axisPick: AxisPickState | null;
  normalTo: boolean;
  // Placement field feedback (ADR 0039 point 5): the last placement a drag sent
  // while it lasts, and typed text that is not a number. Display state.
  placementDraft: PlacementDraft | null;
  placementInvalid: InvalidPlacementText | null;
  // The placement each assembly had before its last placement edit (ADR 0039
  // point 11), by assembly key, for the open Pantin only. Display state.
  previousPlacements: PreviousPlacements;
  // The mouse preset, wheel direction, arrow step and projection of the 3D
  // view (ADR 0036), kept in the browser like the steps. Never saved.
  navigation: NavigationSettings;
}

// Faults are runtime state of the core, cleared when a Pantin opens.
const NO_FAULTS: FaultsResponse = { jammedJoints: [], unresponsiveDrives: [] };

// Runtime faults and the I/O mapping belong to the open Pantin: cleared with it.
const NO_DEVICE_DATA = { faults: NO_FAULTS, io: NO_IO_STATE } as const;

const NO_DEVICE_FORMS = {
  driveForm: null,
  actuatorForm: null,
  sensorForm: null,
  conveyorForm: null,
} as const;

// The close question is not asked (ADR 0050 point 7 for the bridge notice).
export const NO_CLOSE_PROMPT = {
  closePrompt: false,
  closeBridgeNotice: false,
  closeStopsBridge: false,
} as const;

// No positioning tool on, no alignment, nothing kept in the placement fields.
const NO_TOOL_STATE = {
  gizmoMode: null,
  alignment: null,
  axisPick: null,
  normalTo: false,
  placementDraft: null,
  placementInvalid: null,
} as const;

export function initialViewerState(
  language: Language,
  centralLayout: CentralLayout = DEFAULT_CENTRAL_LAYOUT,
  gizmoSteps: SnapSteps = DEFAULT_SNAP_STEPS,
  navigation: NavigationSettings = DEFAULT_NAVIGATION,
  inspector: InspectorPreferences = DEFAULT_INSPECTOR_PREFERENCES,
  themeChoice: ThemeChoice = "system",
): ViewerState {
  return {
    language,
    themeChoice,
    pantins: [],
    openPantin: null,
    expandedNodeIds: new Set(),
    selection: null,
    multiSelectedNodeIds: [],
    renamingNodeId: null,
    ...preferencesState(inspector),
    customAxisJointIds: new Set(),
    creatingPantin: false,
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    pendingRequestCount: 0,
    message: null,
    listSelectedPantinId: null,
    welcomeHidden: false,
    welcomeTab: "home",
    welcomeFilter: "",
    about: CLOSED_ABOUT,
    ...NO_CLOSE_PROMPT,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteDevice: null,
    pendingDeleteAssembly: null,
    pendingGroup: null,
    pendingOrphanCleanup: null,
    pendingRedundantJoints: null,
    jointForm: null,
    assemblyDisplay: NO_ASSEMBLY_DISPLAY,
    // Shown from the start: the panel is where drives are wired (ADR 0022).
    ...NO_DEVICE_FORMS,
    ...NO_DEVICE_DATA,
    centralLayout,
    collapsedDiagramBands: new Set(),
    pendingFeedReplacement: null,
    inspectorFocus: null,
    console: INITIAL_CONSOLE_STATE,
    ...NO_TOOL_STATE,
    previousPlacements: NO_PREVIOUS_PLACEMENTS,
    gizmoSteps,
    navigation,
  };
}

// Entering the edit view: the tree starts expanded down to the bodies, with
// the Pantin selected, and nothing left over from a previous Pantin.
function freshEditView(state: ViewerState, openPantin: PantinResponse): ViewerState {
  return {
    ...state,
    openPantin,
    expandedNodeIds: new Set([
      pantinNodeId(openPantin.id),
      ...openPantin.document.assemblies.map((assembly) =>
        assemblyNodeId(openPantin.id, assembly.key),
      ),
      folderNodeId(openPantin.id, "betweenAssemblies"),
    ]),
    selection: nodeSelection(pantinNodeId(openPantin.id)),
    multiSelectedNodeIds: [],
    renamingNodeId: null,
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    ...NO_CLOSE_PROMPT,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteDevice: null,
    pendingDeleteAssembly: null,
    pendingGroup: null,
    pendingOrphanCleanup: null,
    pendingRedundantJoints: null,
    jointForm: null,
    customAxisJointIds: new Set(),
    assemblyDisplay: NO_ASSEMBLY_DISPLAY,
    ...NO_TOOL_STATE,
    gizmoMode: state.gizmoMode, // the chosen move or rotate gizmo stays on
    previousPlacements: NO_PREVIOUS_PLACEMENTS,
    ...NO_DEVICE_FORMS,
    ...NO_DEVICE_DATA,
    collapsedDiagramBands: new Set(),
    pendingFeedReplacement: null,
  };
}

/**
 * Shows the core's latest answer for the open Pantin, or enters the edit
 * view for a newly opened one. A selection that no longer exists moves to
 * the Pantin itself.
 */
export function withOpenPantin(state: ViewerState, openPantin: PantinResponse): ViewerState {
  if (state.openPantin?.id !== openPantin.id) {
    return freshEditView(state, openPantin);
  }
  const next: ViewerState = { ...state, openPantin };
  return selectionExists(next)
    ? withMultiSelectionPruned(next)
    : {
        ...next,
        selection: nodeSelection(pantinNodeId(openPantin.id)),
        multiSelectedNodeIds: [],
      };
}

export function withRequestStarted(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: state.pendingRequestCount + 1 };
}

export function withRequestFinished(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: Math.max(0, state.pendingRequestCount - 1) };
}
