import type {
  DriveRuntime,
  FaceFile,
  JointPosition,
  PantinResponse,
  PoseSnapshot,
  SimulationClockState,
} from "@pantin/protocol";
import { isAligning } from "../alignment/alignment-view.ts";
import { CLOSED_JOURNAL, type JournalModel } from "../bridge/bridge-journal.ts";
import { type BridgeModel, INITIAL_BRIDGE_MODEL } from "../bridge/bridge-model.ts";
import { bridgeViewOf } from "../bridge/bridge-view.ts";
import type { CentralLayout } from "../central-layout.ts";
import {
  buildClockView,
  type ClockModel,
  type ClockView,
  clockAfterClockState,
  clockAfterPose,
  INITIAL_CLOCK_MODEL,
} from "../clock/clock-model.ts";
import { type ClientConsole, EMPTY_CLIENT_CONSOLE } from "../console/console-list.ts";
import { createChainLinksCache } from "../diagram/diagram-chains.ts";
import { createDiagramModelBuilder } from "../diagram/diagram-view-model.ts";
import type { DraggedPlacement } from "../gizmo/dragged-placement.ts";
import type { LatestWinsSender } from "../gizmo/latest-wins-sender.ts";
import type { SnapSteps } from "../gizmo/placement-snapping.ts";
import { withPlacementFeedbackRules, withToolRules } from "../gizmo/tool-rules.ts";
import { createTranslator, type Language } from "../i18n/translate.ts";
import { createJointStarModelBuilder } from "../joint-star/joint-star-view-model.ts";
import { withAxisPickRules } from "../joints/axis-pick.ts";
import { jointPreviewOf } from "../joints/joint-preview.ts";
import type { InspectorPreferences } from "../layout-preferences.ts";
import { describeFailure } from "../messages.ts";
import type { NavigationSettings } from "../navigation/navigation-settings.ts";
import { withNormalToRules } from "../navigation/normal-to.ts";
import { withRequestFinished, withRequestStarted } from "../request-count.ts";
import type { Viewport } from "../scene/viewport.ts";
import type { ThemeChoice } from "../theme/theme.ts";
import { buildPanelView } from "../view-model.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { reloadIoAfterDocumentChange } from "./io-load.ts";
import { type JournalInputs, showJournal } from "./journal-actions.ts";
import type { StorePorts } from "./store-ports.ts";
import { showTagRead } from "./tag-read.ts";
import { showViewportState } from "./viewport-sync.ts";

// Holds the only mutable state of the viewer and pushes every change to the
// panel and the viewport. Actions (pantin-actions.ts, import-actions.ts, ...)
// compute the next state with pure functions and hand it to update().

export class ViewerStore {
  readonly ports: StorePorts;
  state: ViewerState;
  // Kept outside ViewerState: a File is a browser handle, not display data.
  pendingImportFile: File | null = null;
  // Last Pantin the user asked to open, to ignore answers that arrive late.
  requestedPantinId: string | null = null;
  // Latest position of every joint (metres or radians), from the pose stream.
  jointPositions: ReadonlyMap<string, number> = new Map();
  // Latest value of every tag (SI), read while the inspector is open.
  tagValues: ReadonlyMap<string, number> = new Map();
  // Tags a client wrote and nobody released (ADR 0045 point 5): a PLC cannot write them.
  forcedTags: ReadonlySet<string> = new Set();
  // When the window last re-read the open Pantin after getting the focus back (ADR 0063).
  lastFocusRereadAt: number | null = null;
  // One tag read at a time: a slow core must not pile requests up.
  readingTags = false;
  // The dragged placements of the gizmo, one request in flight (ADR 0034 point 4).
  placementSender: LatestWinsSender<DraggedPlacement> | null = null;
  // Face files of the open Pantins, by Pantin and mesh path (ADR 0035), downloaded once.
  readonly faceFiles = new Map<string, Promise<FaceFile | null>>();
  // Same for the console (ADR 0031 point 4).
  readingConsole = false;
  // The I/O mapping read in flight, shared by its callers (io-load.ts).
  ioRead: { pantin: PantinResponse; done: Promise<void> } | null = null;
  // The lines of the open Pantin's console, outside ViewerState: see console-state.ts.
  consoleList: ClientConsole = EMPTY_CLIENT_CONSOLE;
  private consolePantinId: string | null = null;
  // Latest port states and diagnostics of each drive, by drive id, read with
  // the tags; the chain diagram will light its edges from it (ADR 0029 point 8).
  driveRuntime: ReadonlyMap<string, DriveRuntime> = new Map();
  // The simulation clock of the followed Pantin, from the stream and from the
  // answers of the clock requests; outside ViewerState for the same reason.
  clockModel: ClockModel = INITIAL_CLOCK_MODEL;
  // The PLC bridge and its network fields, outside ViewerState for the same reason.
  bridgeModel: BridgeModel = INITIAL_BRIDGE_MODEL;
  // The bridge log window and the text it last read, outside ViewerState for the same reason.
  journalModel: JournalModel = CLOSED_JOURNAL;
  // What the journal window was last drawn from, so an unrelated update skips it.
  journalShownFor: JournalInputs | null = null;
  // Pantin whose poses are shown, to reset them only when it changes.
  private followedPantinId: string | null = null;
  // Who is linked to whom in the open document, built once per answer of the core.
  readonly chainLinksOf = createChainLinksCache();
  private readonly buildDiagramModel = createDiagramModelBuilder(this.chainLinksOf);
  private readonly buildJointStarModel = createJointStarModelBuilder();

  constructor(
    ports: StorePorts,
    language: Language,
    centralLayout?: CentralLayout,
    gizmoSteps?: SnapSteps,
    navigation?: NavigationSettings,
    inspector?: InspectorPreferences,
    themeChoice?: ThemeChoice,
  ) {
    this.ports = ports;
    this.state = initialViewerState(
      language,
      centralLayout,
      gizmoSteps,
      navigation,
      inspector,
      themeChoice,
    );
  }

  update(requested: ViewerState): void {
    // The tools follow the selection, the layout and the inspector (ADR 0039 point 3).
    const next = withNormalToRules(
      withAxisPickRules(withPlacementFeedbackRules(withToolRules(requested))),
    );
    // A restart on another assembly reads face files again, like a new alignment.
    if (requested.alignment !== null && next.alignment !== requested.alignment) {
      this.faceFiles.clear();
    }
    this.state = next;
    // Another Pantin, or none: its lines are gone, and so is the clear point.
    if ((next.openPantin?.id ?? null) !== this.consolePantinId) {
      this.consolePantinId = next.openPantin?.id ?? null;
      this.consoleList = EMPTY_CLIENT_CONSOLE;
    }
    const viewport = this.ports.viewport();
    viewport.showBodies(next.openPantin?.id ?? null, next.openPantin?.document.bodies ?? []);
    this.followPoses(next.openPantin?.id ?? null, viewport);
    // After followPoses: the tree's marks must not show another Pantin's tag values.
    this.renderPanel();
    this.ports.showJointPositions(this.jointPositions);
    this.ports.showInspectorLive(this.tagValues, this.driveRuntime, this.forcedTags);
    // After followPoses: a Pantin just opened has no tag values yet.
    this.ports.renderDiagram(this.buildDiagramModel(next));
    this.ports.renderJointStar(this.buildJointStarModel(next));
    this.ports.showDiagramLive(this.tagValues, this.driveRuntime, this.forcedTags);
    // After followPoses too: a Pantin just opened starts from a fresh clock.
    this.ports.showClock(this.clockView());
    this.ports.showBridge(bridgeViewOf(this.bridgeModel, next, this.forcedTags.size));
    showJournal(this);
    showViewportState(viewport, next, this.chainLinksOf);
    // Last, after every draw: the read it starts re-enters update(), and a
    // draw after that would show this pass's stale state over the newer one.
    reloadIoAfterDocumentChange(this, next);
  }

  /** The 3D preview alone, for form edits that do not redraw the panel. */
  refreshJointPreview(): void {
    this.ports.viewport().showJointPreview(jointPreviewOf(this.state));
  }

  // Poses follow the open Pantin: closed or replaced, the stream stops and the
  // poses are forgotten; the old Pantin's bodies are replaced anyway.
  private followPoses(pantinId: string | null, viewport: Viewport): void {
    if (pantinId === this.followedPantinId) {
      return;
    }
    this.followedPantinId = pantinId;
    viewport.clearPoses();
    this.jointPositions = new Map();
    // Another Pantin: the previous one's tag values must not flip a bit here.
    this.tagValues = new Map();
    this.forcedTags = new Set();
    this.driveRuntime = new Map();
    this.clockModel = INITIAL_CLOCK_MODEL;
    this.bridgeModel = INITIAL_BRIDGE_MODEL;
    this.journalModel = CLOSED_JOURNAL;
    this.ports.poseStream.follow(pantinId);
  }

  /** A snapshot of the pose stream: the bodies move, the joint sliders follow. */
  receivePose(snapshot: PoseSnapshot): void {
    this.ports.viewport().pushPoses(snapshot);
    this.jointPositions = new Map(
      snapshot.jointPositions.map(({ jointId, position }: JointPosition) => [jointId, position]),
    );
    this.ports.showJointPositions(this.jointPositions);
    this.setClockModel(clockAfterPose(this.clockModel, snapshot.stepCount));
  }

  /** A clock event of the stream, or the answer of a clock request. */
  receiveClock(state: SimulationClockState): void {
    this.setClockModel(clockAfterClockState(this.clockModel, state));
  }

  /** Draws the panel again from the state and the live models. */
  renderPanel(): void {
    this.ports.renderPanel(
      buildPanelView(
        this.state,
        this.consoleList,
        this.clockModel.state?.running === true,
        this.tagValues,
        this.bridgeModel.status,
      ),
    );
  }

  clockView(): ClockView {
    const { state } = this;
    return buildClockView(
      this.clockModel,
      state.openPantin !== null,
      state.language,
      createTranslator(state.language),
      this.forcedTags.size,
    );
  }

  // The bar is written in place: no state update, whatever changed.
  private setClockModel(next: ClockModel): void {
    if (next !== this.clockModel) {
      const wasRunning = this.clockModel.state?.running === true;
      this.clockModel = next;
      // The alignment block says so while the clock runs (ADR 0039 point 4).
      if (wasRunning !== (next.state?.running === true) && isAligning(this.state)) {
        this.renderPanel();
      }
      this.ports.showClock(this.clockView());
    }
  }

  /**
   * Runs one API call with the busy indicator and turns any failure into a
   * message: nothing is swallowed. Resolves with undefined on failure.
   */
  async run<Result>(
    request: () => Promise<Result>,
    apply: (current: ViewerState, result: Result) => ViewerState,
  ): Promise<Result | undefined> {
    this.update(withRequestStarted(this.state));
    try {
      const result = await request();
      this.update(apply(withRequestFinished(this.state), result));
      return result;
    } catch (error) {
      this.update({ ...withRequestFinished(this.state), message: describeFailure(error) });
      return undefined;
    }
  }

  /**
   * One tag read from the core: tag values, forced tags and drive runtime reach
   * the inspector, the 3D markers and the diagram without a redraw.
   */
  showTagRead(
    values: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
    forced: ReadonlySet<string>,
  ) {
    showTagRead(this, values, runtime, forced);
  }

  applyIfStillRequested(current: ViewerState, response: PantinResponse): ViewerState {
    return this.requestedPantinId === response.id ? withOpenPantin(current, response) : current;
  }
}
