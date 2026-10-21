import type {
  CreateIoChannelsRequest,
  CreateIoModuleRequest,
  IoDocument,
  IoMappingResponse,
  PantinId,
  UpdateIoChannelRequest,
  UpdateIoModuleRequest,
} from "@pantin/protocol";
import { addChannels, removeChannel, updateChannel } from "../domain/io-channel-edits.ts";
import { canonicalIoDocument } from "../domain/io-document-text.ts";
import { evaluateIoMapping, ioTagsOf } from "../domain/io-evaluation.ts";
import { type IoMappingSource, mappingOf } from "../domain/io-mapping.ts";
import { addModule, removeModule, updateModule } from "../domain/io-module-edits.ts";
import type { IoTag } from "../domain/io-validation.ts";
import { ApiError } from "../errors.ts";
import { alignIo } from "./io-alignment.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// The I/O mapping of an open Pantin (ADR 0049 points 3 and 4): read and
// edited in memory like the document, checked against the open document's tags,
// unsaved edits included.

function answerOf(openPantin: OpenPantin): IoMappingResponse {
  return evaluateIoMapping(openPantin.io, ioTagsOf(openPantin.document));
}

export async function readIo(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<IoMappingResponse> {
  const openPantin = await loadPantin(context, pantinId);
  alignIo(openPantin);
  return answerOf(openPantin);
}

// An edit never merges with a source it cannot trust (ADR 0049 point 6).
export function refuseUneditable(openPantin: OpenPantin): void {
  if (openPantin.io.kind === "unreadable") {
    throw new ApiError(
      "conflict",
      "io.json cannot be read, so it cannot be edited: fix or delete the file, then discard. See GET /api/pantins/<id>/io.",
    );
  }
}

export function requireMapping(openPantin: OpenPantin): IoDocument {
  if (openPantin.io.kind !== "document") {
    throw new ApiError(
      "not_found",
      "This Pantin has no I/O mapping yet: add a module with POST /api/pantins/<id>/io/modules.",
    );
  }
  return openPantin.io.document;
}

/**
 * Runs one edit on the open mapping; the edit is all or nothing. `outcome` is what the
 * edit wants to tell besides the new mapping, for example the entries it skipped.
 */
export async function editIoWithOutcome<Outcome>(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (openPantin: OpenPantin, tags: IoTag[]) => { document: IoDocument; outcome: Outcome },
): Promise<{ answer: IoMappingResponse; outcome: Outcome }> {
  const openPantin = await loadPantin(context, pantinId);
  refuseUneditable(openPantin);
  // No await from here to the assignment: nobody edits in between.
  alignIo(openPantin);
  const edited = edit(openPantin, ioTagsOf(openPantin.document));
  // Canonical, so that the answer lists the channels in the order of the file.
  openPantin.io = { kind: "document", document: canonicalIoDocument(edited.document) };
  return { answer: answerOf(openPantin), outcome: edited.outcome };
}

async function editIo(
  context: ServiceContext,
  pantinId: PantinId,
  edit: (openPantin: OpenPantin, tags: IoTag[]) => IoDocument,
): Promise<IoMappingResponse> {
  const { answer } = await editIoWithOutcome(context, pantinId, (open, tags) => ({
    document: edit(open, tags),
    outcome: undefined,
  }));
  return answer;
}

export function ioEditOperations(context: ServiceContext) {
  return {
    createIoModule: (pantinId: PantinId, request: CreateIoModuleRequest) =>
      editIo(context, pantinId, (open) =>
        addModule(open.io.kind === "document" ? open.io.document : null, request),
      ),
    updateIoModule: (pantinId: PantinId, moduleKey: string, request: UpdateIoModuleRequest) =>
      editIo(context, pantinId, (open) => updateModule(requireMapping(open), moduleKey, request)),
    deleteIoModule: (pantinId: PantinId, moduleKey: string) =>
      editIo(context, pantinId, (open) => removeModule(requireMapping(open), moduleKey)),
    createIoChannels: (pantinId: PantinId, moduleKey: string, request: CreateIoChannelsRequest) =>
      editIo(context, pantinId, (open, tags) =>
        addChannels(requireMapping(open), moduleKey, request.tags, tags),
      ),
    updateIoChannel: (
      pantinId: PantinId,
      moduleKey: string,
      tagName: string,
      request: UpdateIoChannelRequest,
    ) =>
      editIo(context, pantinId, (open, tags) =>
        updateChannel(requireMapping(open), moduleKey, tagName, request, tags),
      ),
    deleteIoChannel: (pantinId: PantinId, moduleKey: string, tagName: string) =>
      editIo(context, pantinId, (open) => removeChannel(requireMapping(open), moduleKey, tagName)),
  };
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
