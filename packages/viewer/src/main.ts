import { createPantinApiClient } from "./api-client.ts";
import { ViewerController } from "./controller.ts";
import { createViewport, type Viewport } from "./scene/viewport.ts";
import { renderSidePanel } from "./ui/side-panel.ts";

// Composition root: the only place that touches the page and the real fetch.

function requireElement<Kind extends HTMLElement>(selector: string, kind: new () => Kind): Kind {
  const found = document.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`index.html must contain ${selector} (${kind.name}).`);
  }
  return found;
}

function startViewer(): void {
  const panelContainer = requireElement("#side-panel", HTMLElement);
  const canvas = requireElement("#viewport-canvas", HTMLCanvasElement);
  // Bound call: fetch invoked as a method of something else throws "Illegal invocation".
  const api = createPantinApiClient((url, init) => fetch(url, init));

  let viewport: Viewport | null = null;
  const controller = new ViewerController({
    api,
    renderPanel: (view, intents) => renderSidePanel(panelContainer, view, intents),
    viewport: () => {
      if (viewport === null) {
        throw new Error("The viewport is used before it was created.");
      }
      return viewport;
    },
  });
  viewport = createViewport(canvas, (pantinId, body) => api.fetchMeshBytes(pantinId, body.mesh), {
    onBodyPicked: (bodyId) => controller.selectBody(bodyId),
    onLoadError: (message) => controller.showError(message),
  });
  controller.start();
}

startViewer();
