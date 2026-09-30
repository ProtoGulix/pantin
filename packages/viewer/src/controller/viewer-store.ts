import type { JointPosition, PantinResponse, PoseSnapshot } from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import { hiddenBodyIds, selectedBodyIds } from "../assembly-display.ts";
import type { Language } from "../i18n/translate.ts";
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
  // Tag values in the drives panel, written in place for the same reason.
  showTagValues(values: ReadonlyMap<string, number>): void;
  // A getter because the viewport is created after the store: its callbacks
  // need the controller.
  viewport(): Viewport;
  poseStream: PoseStreamClient;
  storeLanguage(language: Language): void;
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
  // Latest value of every tag (SI), read while the drives panel is open.
  tagValues: ReadonlyMap<string, number> = new Map();
  // One tag read at a time: a slow core must not pile requests up.
  readingTags = false;
  // Pantin whose poses are shown, to reset them only when it changes.
  private followedPantinId: string | null = null;

  constructor(ports: StorePorts, language: Language) {
    this.ports = ports;
    this.state = initialViewerState(language);
  }

  update(next: ViewerState): void {
    this.state = next;
    this.ports.renderPanel(buildPanelView(next));
    this.ports.showJointPositions(this.jointPositions);
    this.ports.showTagValues(this.tagValues);
    const viewport = this.ports.viewport();
    viewport.showBodies(next.openPantin?.id ?? null, next.openPantin?.document.bodies ?? []);
    this.followPoses(next.openPantin?.id ?? null, viewport);
    const document = next.openPantin?.document;
    viewport.setSelectedBodies(
      document === undefined ? new Set() : selectedBodyIds(document, next.selectedNodeId),
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
  // bodies return to their reference placement.
  private followPoses(pantinId: string | null, viewport: Viewport): void {
    if (pantinId === this.followedPantinId) {
      return;
    }
    this.followedPantinId = pantinId;
    viewport.clearPoses();
    this.jointPositions = new Map();
    // Another Pantin: the previous one's tag values must not flip a bit here.
    this.tagValues = new Map();
    this.ports.poseStream.follow(pantinId);
  }

  /** A snapshot of the pose stream: the bodies move, the joint sliders follow. */
  receivePose(snapshot: PoseSnapshot): void {
    this.ports.viewport().pushPoses(snapshot);
    this.jointPositions = new Map(
      snapshot.jointPositions.map(({ jointId, position }: JointPosition) => [jointId, position]),
    );
    this.ports.showJointPositions(this.jointPositions);
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

  /** Tag values from the core: the drives panel shows them without a redraw. */
  showTagValues(values: ReadonlyMap<string, number>): void {
    this.tagValues = values;
    this.ports.showTagValues(values);
    this.ports.viewport().showTagStates(values);
  }

  applyIfStillRequested(current: ViewerState, response: PantinResponse): ViewerState {
    return this.requestedPantinId === response.id ? withOpenPantin(current, response) : current;
  }
}
