import { type ConsoleResponse, ConsoleResponseSchema } from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson } from "./api-transport.ts";

// The console route of the API client (ADR 0031 point 4).

export interface ConsoleRoutes {
  // The entries whose sequence is above `after`, oldest first; 0 reads them all.
  getConsole(pantinId: string, after: number): Promise<ConsoleResponse>;
}

export function consoleRoutes(send: SendJson): ConsoleRoutes {
  return {
    getConsole: (pantinId, after) =>
      send(
        pantinUrl(pantinId, `/console?after=${after}`),
        jsonRequest("GET"),
        ConsoleResponseSchema,
      ),
  };
}
