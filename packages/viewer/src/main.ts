import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import { parseStoredLayout, serialiseLayout } from "./central-layout.ts";
import { parseStoredVerbose } from "./console/console-state.ts";
import { receiveViewportPick } from "./controller/axis-pick-actions.ts";
import { receiveBridge } from "./controller/bridge-actions.ts";
import { refreshConsole } from "./controller/console-actions.ts";
import {
  createPanelIntents,
  selectBodyFromViewport,
  selectConveyorFromViewport,
  startViewer,
} from "./controller/controller.ts";
import { refreshTagValues } from "./controller/drive-commands.ts";
import { rereadOnFocus } from "./controller/external-edit-actions.ts";
import { dragPlacement, finishPlacementDrag } from "./controller/placement-actions.ts";
import type { StorePorts } from "./controller/store-ports.ts";
import { ViewerStore } from "./controller/viewer-store.ts";
import { parseStoredGizmoSpace } from "./gizmo/gizmo-space.ts";
import { parseStoredSteps, serializeSteps } from "./gizmo/gizmo-steps.ts";
import { chooseLanguage } from "./i18n/translate.ts";
import { parseStoredGroups, parseStoredOpen, serializeGroups } from "./layout-preferences.ts";
import { errorMessage, meshLoadMessage, type PanelMessage } from "./messages.ts";
import { parseStoredNavigation, serializeNavigation } from "./navigation/navigation-settings.ts";
import { createPoseStreamClient, type PoseStreamClient } from "./pose-stream-client.ts";
import { createInertViewport } from "./scene/inert-viewport.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { SCENE_PALETTES } from "./theme/scene-palette.ts";
import { parseStoredTheme, type ThemeChoice, type ThemeName } from "./theme/theme.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./ui/browser-storage.ts";
import { saveTextAsDownload } from "./ui/file-download.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { createScreen, type Screen } from "./ui/screen.ts";
import { listenToShortcuts } from "./ui/shortcuts.ts";
import { createThemeController, type ThemeController } from "./ui/theme-controller.ts";
import { listenToViewListKey } from "./ui/view-list.ts";
import { listenToWindowFocus } from "./ui/window-focus.ts";

// Composition root: the only place that touches the page, the real fetch and
// the browser's language settings.

// Without WebGL the rest of the viewer still works; startupError says why the
// view is empty. The catch is deliberately broad: the engine is built first, so
// any failure leaves no usable view, and the raw reason is kept for diagnosis.
function createViewportOrInert(
  canvas: HTMLCanvasElement,
  api: PantinApiClient,
  store: ViewerStore,
  theme: ThemeName,
): { viewport: Viewport; startupError: string | null } {
  try {
    const viewport = createViewport(
      canvas,
      (pantinId, body) => api.fetchMeshBytes(pantinId, body.mesh),
      {
        onBodyPicked: (bodyId, doubleClick) => selectBodyFromViewport(store, bodyId, doubleClick),
        onConveyorPicked: (kind, id) => selectConveyorFromViewport(store, kind, id),
        onPlacementDragged: (assemblyKey, placement) =>
          dragPlacement(store, assemblyKey, placement),
        onPlacementDragEnded: () => void finishPlacementDrag(store),
        onAlignmentPick: (pick) => void receiveViewportPick(store, pick),
        onLoadError: (bodyName, reason) =>
          store.update({
            ...store.state,
            message: meshLoadMessage(bodyName, reason),
          }),
      },
      SCENE_PALETTES[theme],
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
    onBridge: (status) => receiveBridge(getStore(), status),
    onInvalid: (detail) => showMessage(errorMessage("message.poseInvalid", {}, detail)),
    onClosed: () => showMessage(errorMessage("message.poseClosed")),
  });
}

// What the ports need from objects created after the store.
interface LateBindings {
  viewport: Viewport | null;
  intents: PanelIntents | null;
  store: ViewerStore | null;
  // The resolved theme, known as soon as the page has applied it.
  theme: ThemeName;
}

// The stored choice is applied to the page at once; the 3D view follows when it exists.
function createTheme(
  late: LateBindings,
  screen: Screen,
): { controller: ThemeController; choice: ThemeChoice } {
  const choice = parseStoredTheme(readStoredText(STORAGE_KEYS.theme));
  const controller = createThemeController(
    document.documentElement,
    window.matchMedia("(prefers-color-scheme: dark)"),
    choice,
    (theme) => {
      late.theme = theme;
      screen.setTheme(theme);
      late.viewport?.setScenePalette(SCENE_PALETTES[theme]);
    },
  );
  return { controller, choice };
}

function createPorts(
  screen: Screen,
  api: PantinApiClient,
  late: LateBindings,
  theme: ThemeController,
): StorePorts {
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
    showInspectorLive: (tags, runtime, forced) => screen.showInspectorLive(tags, runtime, forced),
    renderDiagram: (model) => withIntents((intents) => screen.renderDiagram(model, intents)),
    renderJointStar: (model) => withIntents((intents) => screen.renderJointStar(model, intents)),
    showDiagramLive: (tags, runtime, forced) => screen.showDiagramLive(tags, runtime, forced),
    showConsoleLive: (view) => screen.showConsoleLive(view),
    showClock: (view) => withIntents((intents) => screen.showClock(view, intents)),
    showBridge: (view) => withIntents((intents) => screen.showBridge(view, intents)),
    showOpcuaBridge: (view) => withIntents((intents) => screen.showOpcuaBridge(view, intents)),
    // A draw dropped here is not retried (showJournal skips unchanged inputs); none is,
    // since the window only opens through the intents.
    showBridgeJournal: (view) => withIntents((intents) => screen.showBridgeJournal(view, intents)),
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
    saveTextFile: saveTextAsDownload,
    openLink: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
    storeLanguage: (chosen) => writeStoredText(STORAGE_KEYS.language, chosen),
    applyTheme: (choice) => {
      writeStoredText(STORAGE_KEYS.theme, choice);
      theme.choose(choice);
    },
    storeCentralLayout: (layout) =>
      writeStoredText(STORAGE_KEYS.centralLayout, serialiseLayout(layout)),
    storeGizmoSteps: (steps) => writeStoredText(STORAGE_KEYS.gizmoSteps, serializeSteps(steps)),
    storeGizmoSpace: (space) => writeStoredText(STORAGE_KEYS.gizmoSpace, space),
    storeNavigation: (settings) =>
      writeStoredText(STORAGE_KEYS.navigation, serializeNavigation(settings)),
    storeInspectorOpen: (open) => writeStoredText(STORAGE_KEYS.inspectorOpen, String(open)),
    storeCollapsedGroups: (groups) =>
      writeStoredText(STORAGE_KEYS.collapsedGroups, serializeGroups(groups)),
    readConsoleVerbose: () => parseStoredVerbose(readStoredText(STORAGE_KEYS.consoleVerbose)),
    storeConsoleVerbose: (verbose) => writeStoredText(STORAGE_KEYS.consoleVerbose, String(verbose)),
  };
}

function createStore(screen: Screen, api: PantinApiClient): ViewerStore {
  const language = chooseLanguage(navigator.languages, readStoredText(STORAGE_KEYS.language));
  const late: LateBindings = { viewport: null, intents: null, store: null, theme: "dark" };
  const theme = createTheme(late, screen);
  const store = new ViewerStore(
    createPorts(screen, api, late, theme.controller),
    language,
    parseStoredLayout(readStoredText(STORAGE_KEYS.centralLayout)),
    parseStoredSteps(readStoredText(STORAGE_KEYS.gizmoSteps)),
    parseStoredNavigation(readStoredText(STORAGE_KEYS.navigation)),
    {
      gizmoSpace: parseStoredGizmoSpace(readStoredText(STORAGE_KEYS.gizmoSpace)),
      inspectorOpen: parseStoredOpen(readStoredText(STORAGE_KEYS.inspectorOpen)),
      collapsedGroups: parseStoredGroups(readStoredText(STORAGE_KEYS.collapsedGroups)),
    },
    theme.choice,
  );
  late.store = store;
  late.intents = createPanelIntents(store);
  listenToShortcuts(() => store.state, late.intents);
  const created = createViewportOrInert(screen.canvas, api, store, late.theme);
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
  listenToWindowFocus(() => void rereadOnFocus(store, Date.now()));
  window.setInterval(() => {
    void refreshTagValues(store);
    void refreshConsole(store);
  }, TAG_REFRESH_MILLISECONDS);
}

startApplication();
