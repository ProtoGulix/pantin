import type { IoMappingResponse, PantinId } from "@pantin/protocol";
import { evaluateIoMapping, ioTagsOf } from "../domain/io-evaluation.ts";
import { type IoMappingSource, mappingOf } from "../domain/io-mapping.ts";
import { ApiError } from "../errors.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// GET /api/pantins/:pantinId/io (ADR 0049 points 3 and 8): the open mapping,
// checked against the open document, unsaved edits of both included. Only the
// legacy files are looked up on disk, on each call: they are what the user
// must act on, and nothing else reads them.

export async function readIo(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<IoMappingResponse> {
  const openPantin = await loadPantin(context, pantinId);
  const legacyFiles = await context.store.listLegacyIoFiles(pantinId);
  return evaluateIoMapping(openPantin.io, legacyFiles, ioTagsOf(openPantin.document));
}

/** The bus's mapping source over the same code as the route: valid, or null. */
export function serviceMappingSource(service: {
  readIo(pantinId: PantinId): Promise<IoMappingResponse>;
}): IoMappingSource {
  return {
    read: async (pantinId) => {
      try {
        return mappingOf(await service.readIo(pantinId));
      } catch (error) {
        // A Pantin that vanished or went invalid since the upgrade has no mapping.
        if (error instanceof ApiError) {
          return null;
        }
        throw error;
      }
    },
  };
}
