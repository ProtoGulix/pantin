import type { IoMappingResponse } from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import type { CentralLayout } from "../central-layout.ts";
import type { Viewport } from "../scene/viewport.ts";
import type { StorePorts } from "./store-ports.ts";
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

const NO_MAPPING: IoMappingResponse = {
  status: "missing",
  mappingId: null,
  modules: [],
  problems: [],
  unmappedTags: [],
};

export function testStore(
  api: Partial<PantinApiClient>,
  viewport: Partial<Viewport> = {},
  storeCentralLayout: (layout: CentralLayout) => void = () => undefined,
  ports: Partial<StorePorts> = {},
): ViewerStore {
  return new ViewerStore(
    {
      // Only the calls a test makes: the others would fail loudly as undefined.
      // The mapping is read whenever a Pantin is opened or changed (io-load.ts), so
      // a test that does not care about it gets an answer for no io.json.
      api: { getIoMapping: async () => NO_MAPPING, ...api } as PantinApiClient,
      renderPanel: () => undefined,
      showJointPositions: () => undefined,
      showInspectorLive: () => undefined,
      renderDiagram: () => undefined,
      renderJointStar: () => undefined,
      showDiagramLive: () => undefined,
      // The silent stand-in answers every call; a test names the ones it watches.
      viewport: () => silent<Viewport>(viewport),
      poseStream: { follow: () => undefined },
      saveTextFile: () => undefined,
      openLink: () => undefined,
      storeLanguage: () => undefined,
      applyTheme: () => undefined,
      showConsoleLive: () => undefined,
      showClock: () => undefined,
      showBridge: () => undefined,
      showBridgeJournal: () => undefined,
      storeCentralLayout,
      storeGizmoSteps: () => undefined,
      storeGizmoSpace: () => undefined,
      storeNavigation: () => undefined,
      storeInspectorOpen: () => undefined,
      storeCollapsedGroups: () => undefined,
      ...ports,
    },
    "fr",
  );
}
