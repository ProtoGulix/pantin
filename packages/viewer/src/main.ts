import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import {
  createPanelIntents,
  selectBodyFromViewport,
  startViewer,
} from "./controller/controller.ts";
import { ViewerStore } from "./controller/viewer-store.ts";
import { chooseLanguage } from "./i18n/translate.ts";
import { errorMessage } from "./messages.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./ui/browser-storage.ts";
import { MenuBar } from "./ui/menu-bar.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { listenToShortcuts } from "./ui/shortcuts.ts";
import { SidePanel } from "./ui/side-panel.ts";
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
}

// Everything drawn from the view: menu bar, left panel, texts of index.html.
function createScreen(): Screen {
  const panel = requireElement("#side-panel", HTMLElement);
  const canvas = requireElement("#viewport-canvas", HTMLCanvasElement);
  const hint = requireElement("#viewport-hint", HTMLElement);
  const sidePanel = new SidePanel(panel, requireElement(".layout", HTMLElement));
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
    },
  };
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
      viewport: () => {
        if (viewport === null) {
          throw new Error("The viewport is used before it was created.");
        }
        return viewport;
      },
      storeLanguage: (chosen) => writeStoredText(STORAGE_KEYS.language, chosen),
    },
    language,
  );
  intents = createPanelIntents(store);
  listenToShortcuts(() => store.state, intents);
  viewport = createViewport(
    screen.canvas,
    (pantinId, body) => api.fetchMeshBytes(pantinId, body.mesh),
    {
      onBodyPicked: (bodyId) => selectBodyFromViewport(store, bodyId),
      onLoadError: (bodyName, reason) =>
        store.update({
          ...store.state,
          message: errorMessage("message.meshLoad", { name: bodyName }, reason),
        }),
    },
  );
  return store;
}

function startApplication(): void {
  // Bound call: fetch invoked as a method of something else throws "Illegal invocation".
  const api = createPantinApiClient((url, init) => fetch(url, init));
  startViewer(createStore(createScreen(), api));
}

startApplication();
