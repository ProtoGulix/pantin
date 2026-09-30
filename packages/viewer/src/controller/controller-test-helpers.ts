import type { PantinApiClient } from "../api-client.ts";
import type { Viewport } from "../scene/viewport.ts";
import { ViewerStore } from "./viewer-store.ts";

// A store over a fake API, for the tests of controller actions.

function silent<Port extends object>(): Port {
  // A Proxy has no static type: each property it returns is a no-op function,
  // which is all the store calls on these ports.
  return new Proxy({}, { get: () => () => undefined }) as Port;
}

export function testStore(api: Partial<PantinApiClient>): ViewerStore {
  return new ViewerStore(
    {
      // Only the calls a test makes: the others would fail loudly as undefined.
      api: api as PantinApiClient,
      renderPanel: () => undefined,
      showJointPositions: () => undefined,
      showTagValues: () => undefined,
      viewport: () => silent<Viewport>(),
      poseStream: { follow: () => undefined },
      storeLanguage: () => undefined,
    },
    "fr",
  );
}
