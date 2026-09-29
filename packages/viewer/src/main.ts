import { createPantinApiClient, type PantinApiClient } from "./api-client.ts";
import {
  createPanelIntents,
  selectBodyFromViewport,
  startViewer,
} from "./controller/controller.ts";
import { ViewerStore } from "./controller/viewer-store.ts";
import { chooseLanguage, type Language, type Translate } from "./i18n/translate.ts";
import { errorMessage } from "./messages.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./ui/browser-storage.ts";
import type { PanelIntents } from "./ui/panel-intents.ts";
import { SidePanel } from "./ui/side-panel.ts";

// Composition root: the only place that touches the page, the real fetch and
// the browser's language settings.

function requireElement<Kind extends HTMLElement>(selector: string, kind: new () => Kind): Kind {
  const found = document.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`index.html must contain ${selector} (${kind.name}).`);
  }
  return found;
}

interface PageElements {
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  hint: HTMLElement;
}

// Texts outside the panel (index.html) follow the chosen language too.
function applyPageTexts(page: PageElements, language: Language, translate: Translate): void {
  document.documentElement.lang = language;
  page.panel.setAttribute("aria-label", translate("page.panelLabel"));
  page.canvas.setAttribute("aria-label", translate("page.viewportLabel"));
  page.hint.textContent = translate("page.viewportHint");
}

function createStore(page: PageElements, api: PantinApiClient, sidePanel: SidePanel): ViewerStore {
  const language = chooseLanguage(navigator.languages, readStoredText(STORAGE_KEYS.language));
  // Both are created after the store, because their callbacks need it.
  let viewport: Viewport | null = null;
  let intents: PanelIntents | null = null;
  const store = new ViewerStore(
    {
      api,
      renderPanel: (view) => {
        applyPageTexts(page, view.language, view.translate);
        if (intents !== null) {
          sidePanel.render(view, intents);
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
  viewport = createViewport(
    page.canvas,
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
  const page: PageElements = {
    panel: requireElement("#side-panel", HTMLElement),
    canvas: requireElement("#viewport-canvas", HTMLCanvasElement),
    hint: requireElement("#viewport-hint", HTMLElement),
  };
  const sidePanel = new SidePanel(page.panel, requireElement(".layout", HTMLElement));
  // Bound call: fetch invoked as a method of something else throws "Illegal invocation".
  const api = createPantinApiClient((url, init) => fetch(url, init));
  startViewer(createStore(page, api, sidePanel));
}

startApplication();
