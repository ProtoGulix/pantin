import { API_PREFIX, VersionResponseSchema } from "@pantin/protocol";
import { jsonRequest, type SendJson } from "./api-transport.ts";

// The version route of the API client (ADR 0058 point 3).

export interface VersionRoutes {
  /** The build version of the running core, to compare with the viewer's own. */
  getCoreVersion(): Promise<string>;
}

export function versionRoutes(send: SendJson): VersionRoutes {
  return {
    getCoreVersion: async () =>
      (await send(`${API_PREFIX}/version`, jsonRequest("GET"), VersionResponseSchema)).version,
  };
}
