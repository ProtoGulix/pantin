import {
  IO_LIST_FILE_NAME,
  IO_MODULES_FILE_NAME,
  type IoMappingResponse,
  type PantinId,
} from "@pantin/protocol";
import { evaluateIoMapping, ioTagsOf } from "../domain/io-evaluation.ts";
import { type IoMappingSource, mappingOf } from "../domain/io-mapping.ts";
import { ApiError } from "../errors.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// GET /api/pantins/:pantinId/io (ADR 0045 point 7): both files are read from
// disk on each call and checked against the open document, unsaved edits
// included.

export async function readIo(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<IoMappingResponse> {
  const openPantin = await loadPantin(context, pantinId);
  const [csv, modules] = await Promise.all([
    context.store.readIoFile(pantinId, IO_LIST_FILE_NAME),
    context.store.readIoFile(pantinId, IO_MODULES_FILE_NAME),
  ]);
  return evaluateIoMapping({ csv, modules }, ioTagsOf(openPantin.document));
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
