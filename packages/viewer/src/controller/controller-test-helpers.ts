import type { PantinApiClient } from "../api-client.ts";
import type { CentralLayout } from "../central-layout.ts";
import type { Viewport } from "../scene/viewport.ts";
import { ViewerStore } from "./viewer-store.ts";

// A store over a fake API, for the tests of controller actions.

function silent<Port extends object>(overrides: Partial<Port> = {}): Port {
  // A Proxy has no static type: each property it returns is a no-op function,
  // which is all the store calls on these ports.
  return new Proxy(
    {},
    {
      get: (_target, name) => Reflect.get(overrides, name) ?? (() => undefined),
    },
  ) as Port;
}

export function testStore(
  api: Partial<PantinApiClient>,
  viewport: Partial<Viewport> = {},
  storeCentralLayout: (layout: CentralLayout) => void = () => undefined,
): ViewerStore {
  return new ViewerStore(
    {
      // Only the calls a test makes: the others would fail loudly as undefined.
      api: api as PantinApiClient,
      renderPanel: () => undefined,
      showJointPositions: () => undefined,
      showInspectorLive: () => undefined,
      renderDiagram: () => undefined,
      showDiagramLive: () => undefined,
      // The silent stand-in answers every call; a test names the ones it watches.
      viewport: () => silent<Viewport>(viewport),
      poseStream: { follow: () => undefined },
      storeLanguage: () => undefined,
      storeCentralLayout,
    },
    "fr",
  );
}
