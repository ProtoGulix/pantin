import type { DriveRuntime } from "@pantin/protocol";
import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import { effectiveLayout, parseStoredLayout } from "./central-layout.ts";
import {
  createPanelIntents,
  selectBodyFromViewport,
  startViewer,
} from "./controller/controller.ts";
import { refreshTagValues } from "./controller/drive-commands.ts";
import { ViewerStore } from "./controller/viewer-store.ts";
import type { DiagramModel } from "./diagram/diagram-view-model.ts";
import { chooseLanguage } from "./i18n/translate.ts";
import { errorMessage } from "./messages.ts";
import { createPoseStreamClient } from "./pose-stream-client.ts";
import { createInertViewport } from "./scene/inert-viewport.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./ui/browser-storage.ts";
import { CentralArea } from "./ui/central-area.ts";
import { DiagramView } from "./ui/diagram-view.ts";
import { Inspector } from "./ui/inspector.ts";
import { MenuBar } from "./ui/menu-bar.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { listenToShortcuts } from "./ui/shortcuts.ts";
import { SidePanel } from "./ui/side-panel.ts";
import { WelcomeDialog } from "./ui/welcome-dialog.ts";
import type { PanelView } from "./view-model.ts";

// Composition root: the only place that touches the page, the real fetch and
// the browser's language settings.

function requireElement<Kind extends HTMLElement>(selector: string, kind: new () => Kind): Kind {
  const found = document.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`index.html must contain ${selector} (${kind.name}).`);
  }
  return found;
}

interface Screen {
  canvas: HTMLCanvasElement;
  render(view: PanelView, intents: PanelIntents): void;
  showJointPositions(positions: ReadonlyMap<string, number>): void;
  showInspectorLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
  ): void;
  renderDiagram(model: DiagramModel, intents: PanelIntents): void;
  showDiagramLive(
    tags: ReadonlyMap<string, number>,
    runtime: ReadonlyMap<string, DriveRuntime>,
  ): void;
}

// Everything drawn from the view: menu bar, left panel, welcome dialog, texts of index.html.
function createScreen(): Screen {
  const panel = requireElement("#side-panel", HTMLElement);
  const canvas = requireElement("#viewport-canvas", HTMLCanvasElement);
  const hint = requireElement("#viewport-hint", HTMLElement);
  const sidePanel = new SidePanel(panel, requireElement(".layout", HTMLElement));
  const welcome = new WelcomeDialog(requireElement("#welcome", HTMLElement), (mode) => {
    if (mode === "edit") {
      sidePanel.focusTree();
    } else {
      canvas.focus();
    }
  });
  // Over the canvas, under the welcome dialog.
  const diagram = new DiagramView(
    requireElement(".viewport", HTMLElement),
    requireElement("#welcome", HTMLElement),
  );
  const centralArea = new CentralArea(requireElement(".viewport", HTMLElement));
  const inspector = new Inspector(requireElement("#inspector", HTMLElement));
  const menuBar = new MenuBar(requireElement("#menu-bar", HTMLElement), sidePanel.callbacks);
  return {
    canvas,
    render: (view, intents) => {
      document.documentElement.lang = view.language;
      panel.setAttribute("aria-label", view.translate("page.panelLabel"));
      canvas.setAttribute("aria-label", view.translate("page.viewportLabel"));
      hint.textContent = view.viewportHint;
      menuBar.render(view.menus, view.translate, intents);
      sidePanel.render(view, intents);
      centralArea.render(
        effectiveLayout(view.toolbar.centralLayout, view.toolbar.mode === "edit"),
        view.translate,
      );
      welcome.render(view, intents);
      inspector.render(view.inspector, view.translate, intents);
    },
    showJointPositions: (positions) => inspector.showJointPositions(positions),
    showInspectorLive: (tags, runtime) => inspector.showLive(tags, runtime),
    renderDiagram: (model, intents) => diagram.render(model, intents),
    showDiagramLive: (tags, runtime) => diagram.showLive(tags, runtime),
  };
}

// Without WebGL the rest of the viewer still works; startupError says why the
// view is empty. The catch is deliberately broad: the engine is built first, so
// any failure leaves no usable view, and the raw reason is kept for diagnosis.
function createViewportOrInert(
  canvas: HTMLCanvasElement,
  api: PantinApiClient,
  store: ViewerStore,
): { viewport: Viewport; startupError: string | null } {
  try {
    const viewport = createViewport(
      canvas,
      (pantinId, body) => api.fetchMeshBytes(pantinId, body.mesh),
      {
        onBodyPicked: (bodyId, doubleClick) => selectBodyFromViewport(store, bodyId, doubleClick),
        onLoadError: (bodyName, reason) =>
          store.update({
            ...store.state,
            message: errorMessage("message.meshLoad", { name: bodyName }, reason),
          }),
      },
    );
    return { viewport, startupError: null };
  } catch (error) {
    const startupError = error instanceof Error ? error.message : String(error);
    return { viewport: createInertViewport(), startupError };
  }
}

function createStore(screen: Screen, api: PantinApiClient): ViewerStore {
  const language = chooseLanguage(navigator.languages, readStoredText(STORAGE_KEYS.language));
  // Both are created after the store, because their callbacks need it.
  let viewport: Viewport | null = null;
  let intents: PanelIntents | null = null;
  const store = new ViewerStore(
    {
      api,
      renderPanel: (view) => {
        if (intents !== null) {
          screen.render(view, intents);
        }
      },
      showJointPositions: (positions) => screen.showJointPositions(positions),
      showInspectorLive: (tags, runtime) => screen.showInspectorLive(tags, runtime),
      renderDiagram: (model) => {
        if (intents !== null) {
          screen.renderDiagram(model, intents);
        }
      },
      showDiagramLive: (tags, runtime) => screen.showDiagramLive(tags, runtime),
      viewport: () => {
        if (viewport === null) {
          throw new Error("The viewport is used before it was created.");
        }
        return viewport;
      },
      poseStream: createPoseStreamClient((url) => new EventSource(url), {
        onSnapshot: (snapshot) => store.receivePose(snapshot),
        onInvalid: (detail) =>
          store.update({
            ...store.state,
            message: errorMessage("message.poseInvalid", {}, detail),
          }),
        onClosed: () =>
          store.update({ ...store.state, message: errorMessage("message.poseClosed") }),
      }),
      storeLanguage: (chosen) => writeStoredText(STORAGE_KEYS.language, chosen),
      storeCentralLayout: (layout) => writeStoredText(STORAGE_KEYS.centralLayout, layout),
    },
    language,
    parseStoredLayout(readStoredText(STORAGE_KEYS.centralLayout)),
  );
  intents = createPanelIntents(store);
  listenToShortcuts(() => store.state, intents);
  const created = createViewportOrInert(screen.canvas, api, store);
  viewport = created.viewport;
  if (created.startupError !== null) {
    const message = errorMessage("message.webglUnavailable", {}, created.startupError);
    store.update({ ...store.state, message });
  }
  return store;
}

// Tag values change at every simulation step: while the inspector is open
// or the Pantin has sensors (ADR 0024), they are read four times a second (a
// stand-in until the tag bus, CLAUDE.md section 9, pushes them).
const TAG_REFRESH_MILLISECONDS = 250;

function startApplication(): void {
  // Bound call: fetch invoked as a method of something else throws "Illegal invocation".
  const api = createPantinApiClient((url, init) => fetch(url, init));
  const store = createStore(createScreen(), api);
  startViewer(store);
  window.setInterval(() => void refreshTagValues(store), TAG_REFRESH_MILLISECONDS);
}

startApplication();
