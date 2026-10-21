import {
  type ConsoleResponse,
  ConsoleResponseSchema,
  SetConsoleVerboseRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// The console routes of the API client (ADR 0031 point 4, ADR 0061 point 6).

const VerboseAnswerSchema = ConsoleResponseSchema.pick({ verbose: true });

export interface ConsoleRoutes {
  // The entries whose sequence is above `after`, oldest first; 0 reads them all.
  getConsole(pantinId: string, after: number): Promise<ConsoleResponse>;
  // Turns verbose mode on or off; setting the current value is accepted.
  setConsoleVerbose(pantinId: string, verbose: boolean): Promise<{ verbose: boolean }>;
}

export function consoleRoutes(send: SendJson): ConsoleRoutes {
  return {
    getConsole: (pantinId, after) =>
      send(
        pantinUrl(pantinId, `/console?after=${after}`),
        jsonRequest("GET"),
        ConsoleResponseSchema,
      ),
    setConsoleVerbose: async (pantinId, verbose) => {
      const request = validInputOrThrow(SetConsoleVerboseRequestSchema, { verbose });
      return send(
        pantinUrl(pantinId, "/console"),
        jsonRequest("PUT", request),
        VerboseAnswerSchema,
      );
    },
  };
}
