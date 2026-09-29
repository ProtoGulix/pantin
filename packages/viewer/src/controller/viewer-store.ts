import type { PantinResponse } from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import type { Language } from "../i18n/translate.ts";
import { describeFailure } from "../messages.ts";
import type { Viewport } from "../scene/viewport.ts";
import { bodyIdOfNode } from "../tree/node-ids.ts";
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
  // A getter because the viewport is created after the store: its callbacks
  // need the controller.
  viewport(): Viewport;
  storeLanguage(language: Language): void;
}

export class ViewerStore {
  readonly ports: StorePorts;
  state: ViewerState;
  // Kept outside ViewerState: a File is a browser handle, not display data.
  pendingImportFile: File | null = null;
  // Last Pantin the user asked to open, to ignore answers that arrive late.
  requestedPantinId: string | null = null;

  constructor(ports: StorePorts, language: Language) {
    this.ports = ports;
    this.state = initialViewerState(language);
  }

  update(next: ViewerState): void {
    this.state = next;
    this.ports.renderPanel(buildPanelView(next));
    const viewport = this.ports.viewport();
    viewport.showBodies(next.openPantin?.id ?? null, next.openPantin?.document.bodies ?? []);
    viewport.setSelectedBody(bodyIdOfNode(next.selectedNodeId));
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

  applyIfStillRequested(current: ViewerState, response: PantinResponse): ViewerState {
    return this.requestedPantinId === response.id ? withOpenPantin(current, response) : current;
  }
}
