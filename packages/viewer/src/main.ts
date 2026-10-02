import type { DriveRuntime } from "@pantin/protocol";
import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import { effectiveLayout, parseStoredLayout } from "./central-layout.ts";
import type { ClockView } from "./clock/clock-model.ts";
import type { ConsoleView } from "./console/console-view.ts";
import { refreshConsole } from "./controller/console-actions.ts";
import {
  createPanelIntents,
  selectBodyFromViewport,
  startViewer,
} from "./controller/controller.ts";
import { refreshTagValues } from "./controller/drive-commands.ts";
import { dragPlacement, finishPlacementDrag } from "./controller/placement-actions.ts";
import { type StorePorts, ViewerStore } from "./controller/viewer-store.ts";
import type { DiagramModel } from "./diagram/diagram-view-model.ts";
import { parseStoredSteps, serializeSteps } from "./gizmo/gizmo-steps.ts";
import { chooseLanguage } from "./i18n/translate.ts";
import { errorMessage, type PanelMessage } from "./messages.ts";
import { parseStoredNavigation, serializeNavigation } from "./navigation/navigation-settings.ts";
import { createPoseStreamClient, type PoseStreamClient } from "./pose-stream-client.ts";
import { createInertViewport } from "./scene/inert-viewport.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./ui/browser-storage.ts";
import { CentralArea } from "./ui/central-area.ts";
import { ConsolePanel } from "./ui/console-panel.ts";
import { DiagramView } from "./ui/diagram-view.ts";
import { Inspector } from "./ui/inspector.ts";
import { MenuBar } from "./ui/menu-bar.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { listenToShortcuts } from "./ui/shortcuts.ts";
import { SidePanel } from "./ui/side-panel.ts";
import { TransportBar } from "./ui/transport-bar.ts";
import { ViewCube } from "./ui/view-cube.ts";
import { listenToViewListKey } from "./ui/view-list.ts";
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
  showConsoleLive(view: ConsoleView | null): void;
  showClock(view: ClockView, intents: PanelIntents): void;
  showCameraOrientation(alpha: number, beta: number): void;
}

// Its counter sits in the toolbar of the side panel, which is redrawn: looked up when needed.
function createConsolePanel(sidePanel: HTMLElement): ConsolePanel {
  return new ConsolePanel(
    requireElement("#console", HTMLElement),
    requireElement(".central", HTMLElement),
    () => sidePanel.querySelector<HTMLElement>(".console-counter"),
  );
}

// Over the canvas, under the welcome dialog.
function createDiagramView(): DiagramView {
  return new DiagramView(
    requireElement(".viewport", HTMLElement),
    requireElement("#welcome", HTMLElement),
  );
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
  const diagram = createDiagramView();
  const centralArea = new CentralArea(requireElement(".viewport", HTMLElement));
  const consolePanel = createConsolePanel(panel);
  const transportBar = new TransportBar(requireElement("#transport", HTMLElement));
  const inspector = new Inspector(requireElement("#inspector", HTMLElement));
  const viewCube = new ViewCube(requireElement("#view-cube", HTMLElement), canvas);
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
      consolePanel.render(view.console, view.translate, intents);
      welcome.render(view, intents);
      viewCube.render(view, intents);
      inspector.render(view.inspector, view.translate, intents);
    },
    showJointPositions: (positions) => inspector.showJointPositions(positions),
    showInspectorLive: (tags, runtime) => inspector.showLive(tags, runtime),
    renderDiagram: (model, intents) => diagram.render(model, intents),
    showDiagramLive: (tags, runtime) => diagram.showLive(tags, runtime),
    showConsoleLive: (view) => consolePanel.showLive(view),
    showClock: (view, intents) => transportBar.render(view, intents),
    showCameraOrientation: (alpha, beta) => viewCube.showOrientation(alpha, beta),
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
        onPlacementDragged: (assemblyKey, placement) =>
          dragPlacement(store, assemblyKey, placement),
        onPlacementDragEnded: () => void finishPlacementDrag(store),
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

// A getter because the store is created with this client.
function createStreamClient(getStore: () => ViewerStore): PoseStreamClient {
  const showMessage = (message: PanelMessage): void =>
    getStore().update({ ...getStore().state, message });
  return createPoseStreamClient((url) => new EventSource(url), {
    onSnapshot: (snapshot) => getStore().receivePose(snapshot),
    onClock: (state) => getStore().receiveClock(state),
    onInvalid: (detail) => showMessage(errorMessage("message.poseInvalid", {}, detail)),
    onClosed: () => showMessage(errorMessage("message.poseClosed")),
  });
}

// What the ports need from objects created after the store.
interface LateBindings {
  viewport: Viewport | null;
  intents: PanelIntents | null;
  store: ViewerStore | null;
}

function createPorts(screen: Screen, api: PantinApiClient, late: LateBindings): StorePorts {
  // The panel, diagram and bar are drawn once the intents exist.
  const withIntents = (draw: (intents: PanelIntents) => void): void => {
    if (late.intents !== null) {
      draw(late.intents);
    }
  };
  return {
    api,
    renderPanel: (view) => withIntents((intents) => screen.render(view, intents)),
    showJointPositions: (positions) => screen.showJointPositions(positions),
    showInspectorLive: (tags, runtime) => screen.showInspectorLive(tags, runtime),
    renderDiagram: (model) => withIntents((intents) => screen.renderDiagram(model, intents)),
    showDiagramLive: (tags, runtime) => screen.showDiagramLive(tags, runtime),
    showConsoleLive: (view) => screen.showConsoleLive(view),
    showClock: (view) => withIntents((intents) => screen.showClock(view, intents)),
    viewport: () => {
      if (late.viewport === null) {
        throw new Error("The viewport is used before it was created.");
      }
      return late.viewport;
    },
    poseStream: createStreamClient(() => {
      if (late.store === null) {
        throw new Error("The pose stream is used before the store was created.");
      }
      return late.store;
    }),
    storeLanguage: (chosen) => writeStoredText(STORAGE_KEYS.language, chosen),
    storeCentralLayout: (layout) => writeStoredText(STORAGE_KEYS.centralLayout, layout),
    storeGizmoSteps: (steps) => writeStoredText(STORAGE_KEYS.gizmoSteps, serializeSteps(steps)),
    storeNavigation: (settings) =>
      writeStoredText(STORAGE_KEYS.navigation, serializeNavigation(settings)),
  };
}

function createStore(screen: Screen, api: PantinApiClient): ViewerStore {
  const language = chooseLanguage(navigator.languages, readStoredText(STORAGE_KEYS.language));
  const late: LateBindings = { viewport: null, intents: null, store: null };
  const store = new ViewerStore(
    createPorts(screen, api, late),
    language,
    parseStoredLayout(readStoredText(STORAGE_KEYS.centralLayout)),
    parseStoredSteps(readStoredText(STORAGE_KEYS.gizmoSteps)),
    parseStoredNavigation(readStoredText(STORAGE_KEYS.navigation)),
  );
  late.store = store;
  late.intents = createPanelIntents(store);
  listenToShortcuts(() => store.state, late.intents);
  const created = createViewportOrInert(screen.canvas, api, store);
  late.viewport = created.viewport;
  created.viewport.onCameraOrientation(screen.showCameraOrientation);
  listenToViewListKey(() => store.state, late.intents, screen.canvas);
  if (created.startupError !== null) {
    const message = errorMessage("message.webglUnavailable", {}, created.startupError);
    store.update({ ...store.state, message });
  }
  return store;
}

// Tag values change at every simulation step: while the inspector is open
// or the Pantin has sensors (ADR 0024), they are read four times a second (a
// stand-in until the tag bus, CLAUDE.md section 9, pushes them). The console
// entries of the open Pantin are read in the same loop (ADR 0031 point 4).
const TAG_REFRESH_MILLISECONDS = 250;

function startApplication(): void {
  // Bound call: fetch invoked as a method of something else throws "Illegal invocation".
  const api = createPantinApiClient((url, init) => fetch(url, init));
  const store = createStore(createScreen(), api);
  startViewer(store);
  window.setInterval(() => {
    void refreshTagValues(store);
    void refreshConsole(store);
  }, TAG_REFRESH_MILLISECONDS);
}

startApplication();
