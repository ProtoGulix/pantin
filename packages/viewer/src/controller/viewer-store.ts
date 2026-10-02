import type {
  DriveRuntime,
  JointPosition,
  PantinResponse,
  PoseSnapshot,
  SimulationClockState,
} from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import { hiddenBodyIds } from "../assembly-display.ts";
import { type CentralLayout, shouldRender } from "../central-layout.ts";
import {
  buildClockView,
  type ClockModel,
  type ClockView,
  clockAfterClockState,
  clockAfterPose,
  INITIAL_CLOCK_MODEL,
} from "../clock/clock-model.ts";
import { type ClientConsole, EMPTY_CLIENT_CONSOLE } from "../console/console-list.ts";
import { buildConsoleView, type ConsoleView } from "../console/console-view.ts";
import { createChainLinksCache } from "../diagram/diagram-chains.ts";
import { highlightedBodyIds } from "../diagram/diagram-selection.ts";
import { createDiagramModelBuilder, type DiagramModel } from "../diagram/diagram-view-model.ts";
import { createTranslator, type Language } from "../i18n/translate.ts";
import { jointPreviewOf } from "../joints/joint-preview.ts";
import { describeFailure } from "../messages.ts";
import type { PoseStreamClient } from "../pose-stream-client.ts";
import type { Viewport } from "../scene/viewport.ts";
import { sensorMarkersOf } from "../sensors/sensor-markers.ts";
import { buildPanelView, type PanelView } from "../view-model.ts";
import {
  initialViewerState,
  type ViewerState,
  withOpenPantin,
  withRequestFinished,
  withRequestStarted,
} from "../viewer-state.ts";

// Holds the only mutable state of the viewer and pushes every change to the
// panel and the viewport. Actions (pantin-actions.ts, import-actions.ts, ...)
// compute the next state with pure functions and hand it to update().

export interface StorePorts {
  api: PantinApiClient;
  renderPanel(view: PanelView): void;
  // Joint sliders follow the poses without redrawing the panel: a redraw
  // would interrupt a drag.
  showJointPositions(positions: ReadonlyMap<string, number>): void;
  // Live values of the inspector (tags, drive diagnostics), written in place
  // for the same reason.
  showInspectorLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
  ): void;
  // The chain diagram (ADR 0029), redrawn from the model; the live state
  // (tags and drive runtime) reaches it without a redraw.
  renderDiagram(model: DiagramModel): void;
  showDiagramLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
  ): void;
  // The console panel and its counter, written in place (ADR 0031 point 4).
  showConsoleLive(view: ConsoleView | null): void;
  // The transport bar (ADR 0032 point 10): its texts are written in place, so
  // a pose or a clock event never redraws the viewer.
  showClock(view: ClockView): void;
  // A getter because the viewport is created after the store: its callbacks
  // need the controller.
  viewport(): Viewport;
  poseStream: PoseStreamClient;
  storeLanguage(language: Language): void;
  storeCentralLayout(layout: CentralLayout): void;
}

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
  // One tag read at a time: a slow core must not pile requests up.
  readingTags = false;
  // Same for the console (ADR 0031 point 4).
  readingConsole = false;
  // The lines of the open Pantin's console, outside ViewerState: see console-state.ts.
  consoleList: ClientConsole = EMPTY_CLIENT_CONSOLE;
  private consolePantinId: string | null = null;
  // Latest port states and diagnostics of each drive, by drive id, read with
  // the tags; the chain diagram will light its edges from it (ADR 0029 point 8).
  driveRuntime: ReadonlyMap<string, DriveRuntime> = new Map();
  // The simulation clock of the followed Pantin, from the stream and from the
  // answers of the clock requests; outside ViewerState for the same reason.
  clockModel: ClockModel = INITIAL_CLOCK_MODEL;
  // Pantin whose poses are shown, to reset them only when it changes.
  private followedPantinId: string | null = null;
  // Who is linked to whom in the open document, built once per answer of the core.
  readonly chainLinksOf = createChainLinksCache();
  private readonly buildDiagramModel = createDiagramModelBuilder(this.chainLinksOf);

  constructor(ports: StorePorts, language: Language, centralLayout?: CentralLayout) {
    this.ports = ports;
    this.state = initialViewerState(language, centralLayout);
  }

  update(next: ViewerState): void {
    this.state = next;
    // Another Pantin, or none: its lines are gone, and so is the clear point.
    if ((next.openPantin?.id ?? null) !== this.consolePantinId) {
      this.consolePantinId = next.openPantin?.id ?? null;
      this.consoleList = EMPTY_CLIENT_CONSOLE;
    }
    this.ports.renderPanel(buildPanelView(next, this.consoleList));
    this.ports.showJointPositions(this.jointPositions);
    this.ports.showInspectorLive(this.tagValues, this.driveRuntime);
    const viewport = this.ports.viewport();
    viewport.showBodies(next.openPantin?.id ?? null, next.openPantin?.document.bodies ?? []);
    this.followPoses(next.openPantin?.id ?? null, viewport);
    // After followPoses: a Pantin just opened has no tag values yet.
    this.ports.renderDiagram(this.buildDiagramModel(next));
    this.ports.showDiagramLive(this.tagValues, this.driveRuntime);
    // After followPoses too: a Pantin just opened starts from a fresh clock.
    this.ports.showClock(this.clockView());
    const document = next.openPantin?.document;
    viewport.setRendering(shouldRender(next.centralLayout, next.openPantin !== null));
    viewport.setSelectedBodies(
      document === undefined || next.openPantin === null
        ? new Set()
        : highlightedBodyIds(document, this.chainLinksOf(document), next.selection),
    );
    viewport.setHiddenBodies(
      document === undefined ? new Set() : hiddenBodyIds(document, next.assemblyDisplay),
    );
    viewport.showJointPreview(jointPreviewOf(next));
    viewport.showSensorMarkers(sensorMarkersOf(document));
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
    this.driveRuntime = new Map();
    this.clockModel = INITIAL_CLOCK_MODEL;
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

  clockView(): ClockView {
    const { state } = this;
    return buildClockView(
      this.clockModel,
      state.openPantin !== null,
      state.language,
      createTranslator(state.language),
    );
  }

  // The bar is written in place: no state update, whatever changed.
  private setClockModel(next: ClockModel): void {
    if (next !== this.clockModel) {
      this.clockModel = next;
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
   * One tag read from the core: tag values and drive runtime reach the
   * inspector, the 3D markers and the diagram without a redraw, the diagram once.
   */
  showTagRead(values: ReadonlyMap<string, number>, runtime: ReadonlyMap<string, DriveRuntime>) {
    this.tagValues = values;
    this.driveRuntime = runtime;
    this.ports.showInspectorLive(values, runtime);
    this.ports.viewport().showTagStates(values);
    this.ports.showDiagramLive(values, runtime);
  }

  /** New console lines reach the panel and the toolbar counter in place, without a redraw. */
  showConsoleList(list: ClientConsole): void {
    this.consoleList = list;
    const { state } = this;
    this.ports.showConsoleLive(
      buildConsoleView(
        state.console,
        list,
        state.openPantin,
        state.language,
        createTranslator(state.language),
      ),
    );
  }

  applyIfStillRequested(current: ViewerState, response: PantinResponse): ViewerState {
    return this.requestedPantinId === response.id ? withOpenPantin(current, response) : current;
  }
}
