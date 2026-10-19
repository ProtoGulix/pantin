import { sendJson } from "./responses.ts";
import type { Route } from "./route-context.ts";

// The core's build version (ADR 0058 point 3), read once at start-up.
export const VERSION_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["version"],
    handle: async ({ response, buildVersion }) =>
      sendJson(response, 200, { version: buildVersion }),
  },
];
