import type { Body, FaultsResponse, PantinResponse, PantinSummary } from "@pantin/protocol";
import type { ActuatorFormState } from "./actuators/actuator-form.ts";
import { type AssemblyDisplay, NO_ASSEMBLY_DISPLAY } from "./assembly-display.ts";
import type { DeviceRef } from "./device-selection.ts";
import type { Endpoint, ReplacedFeed } from "./diagram/diagram-wiring.ts";
import type { DriveFormState } from "./drives/drive-form.ts";
import type { Language } from "./i18n/translate.ts";
import type { PendingImport } from "./import-options.ts";
import type { JointFormState } from "./joints/joint-form.ts";
import type { PanelMessage } from "./messages.ts";
import type { SensorFormState } from "./sensors/sensor-form.ts";
import { assemblyNodeId, bodyNodeId, folderNodeId, pantinNodeId } from "./tree/node-ids.ts";
import { selectionExists, withRevealedNode } from "./tree/tree-state.ts";

// Everything the viewer shows, as plain data. The core stays the source of
// truth: this is only the last answer it gave, plus purely local UI state.

export type WelcomeTab = "home" | "all";

interface ContextMenuState {
  nodeId: string;
  // Viewport coordinates of the pointer, in CSS pixels.
  x: number;
  y: number;
}

// A link drawn in the diagram that replaces a whole feed, waiting for the
// user to confirm (ADR 0029 point 6). The endpoints are kept, not the edit:
// the edit is rebuilt from the document as it is when the user answers.
interface PendingDiagramLink {
  from: Endpoint;
  to: Endpoint;
  replaced: ReplacedFeed;
}

export interface ViewerState {
  language: Language;
  pantins: readonly PantinSummary[];
  openPantin: PantinResponse | null;
  expandedNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  // A drive, an actuator or a sensor selected, which has no tree row
  // (ADR 0030): then selectedNodeId is null, and the other way round. The two
  // fields become one union when the left panel goes (ADR 0030 point 2, step 2).
  selectedDevice: DeviceRef | null;
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
  // Edit view: closing with unsaved changes waits for the user's choice.
  closePrompt: boolean;
  // Edit view: a body waiting for the user to confirm its deletion.
  pendingDeleteBodyId: string | null;
  // Same for a joint.
  pendingDeleteJointId: string | null;
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
  faults: FaultsResponse;
  // The chain diagram (ADR 0029) replaces the 3D view while shown; the bands
  // the user folded. Display state only: never saved.
  diagramShown: boolean;
  collapsedDiagramBands: ReadonlySet<string>;
  pendingFeedReplacement: PendingDiagramLink | null;
}

// Faults are runtime state of the core, cleared when a Pantin opens.
const NO_FAULTS: FaultsResponse = { jammedJoints: [], unresponsiveDrives: [] };

export function initialViewerState(language: Language): ViewerState {
  return {
    language,
    pantins: [],
    openPantin: null,
    expandedNodeIds: new Set(),
    selectedNodeId: null,
    selectedDevice: null,
    renamingNodeId: null,
    collapsedPropertyGroups: new Set(),
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
    closePrompt: false,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    jointForm: null,
    assemblyDisplay: NO_ASSEMBLY_DISPLAY,
    // Shown from the start: the panel is where drives are wired (ADR 0022).
    inspectorOpen: true,
    driveForm: null,
    actuatorForm: null,
    sensorForm: null,
    faults: NO_FAULTS,
    diagramShown: false,
    collapsedDiagramBands: new Set(),
    pendingFeedReplacement: null,
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
    selectedNodeId: pantinNodeId(openPantin.id),
    selectedDevice: null,
    renamingNodeId: null,
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    closePrompt: false,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    jointForm: null,
    customAxisJointIds: new Set(),
    assemblyDisplay: NO_ASSEMBLY_DISPLAY,
    driveForm: null,
    actuatorForm: null,
    sensorForm: null,
    faults: NO_FAULTS,
    diagramShown: false,
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
    ? next
    : { ...next, selectedNodeId: pantinNodeId(openPantin.id), selectedDevice: null };
}

export function withRequestStarted(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: state.pendingRequestCount + 1 };
}

export function withRequestFinished(state: ViewerState): ViewerState {
  return { ...state, pendingRequestCount: Math.max(0, state.pendingRequestCount - 1) };
}

export function withImportStarted(state: ViewerState): ViewerState {
  return { ...state, importInProgress: true, message: null };
}

/** The import failed: the form stays open so the user can retry or cancel. */
export function withImportFailed(state: ViewerState): ViewerState {
  return { ...state, importInProgress: false };
}

/**
 * The core created one body (GLB, STL) or several (one per STEP assembly
 * component). The form closes and the first new body is selected and shown
 * in the tree, so the user sees at once what arrived.
 */
export function withImportedBodies(
  state: ViewerState,
  importedBodies: readonly Body[],
): ViewerState {
  const closed: ViewerState = { ...state, importInProgress: false, pendingImport: null };
  const firstBody = importedBodies[0];
  const pantinId = state.openPantin?.id;
  return firstBody === undefined || pantinId === undefined
    ? closed
    : withRevealedNode(closed, bodyNodeId(pantinId, firstBody.id));
}
