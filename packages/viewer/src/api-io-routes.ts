import {
  type CreateIoChannelsRequest,
  CreateIoChannelsRequestSchema,
  type CreateIoModuleRequest,
  CreateIoModuleRequestSchema,
  type IoMappingResponse,
  IoMappingResponseSchema,
  type UpdateIoChannelRequest,
  UpdateIoChannelRequestSchema,
  type UpdateIoModuleRequest,
  UpdateIoModuleRequestSchema,
} from "@pantin/protocol";
import {
  type FetchFunction,
  failureFromResponse,
  jsonRequest,
  pantinUrl,
  type SendJson,
  sendRequest,
  validInputOrThrow,
} from "./api-transport.ts";

// I/O mapping routes of the API client (ADR 0049 point 4). Every answer is the
// whole mapping, so the viewer never patches its copy by hand.

interface TextFile {
  fileName: string;
  text: string;
}

export interface IoRoutes {
  // The GVL is text, not JSON: only the error answers are validated.
  fetchIoGvl(pantinId: string): Promise<TextFile>;
  // The CSV keeps its byte order mark, which Excel needs to read accents.
  fetchIoCsv(pantinId: string): Promise<TextFile>;
  getIoMapping(pantinId: string): Promise<IoMappingResponse>;
  createIoModule(pantinId: string, request: CreateIoModuleRequest): Promise<IoMappingResponse>;
  updateIoModule(
    pantinId: string,
    moduleKey: string,
    request: UpdateIoModuleRequest,
  ): Promise<IoMappingResponse>;
  deleteIoModule(pantinId: string, moduleKey: string): Promise<IoMappingResponse>;
  createIoChannels(
    pantinId: string,
    moduleKey: string,
    request: CreateIoChannelsRequest,
  ): Promise<IoMappingResponse>;
  updateIoChannel(
    pantinId: string,
    tag: string,
    request: UpdateIoChannelRequest,
  ): Promise<IoMappingResponse>;
  deleteIoChannel(pantinId: string, tag: string): Promise<IoMappingResponse>;
}

function moduleUrl(pantinId: string, moduleKey: string, suffix = ""): string {
  return pantinUrl(pantinId, `/io/modules/${encodeURIComponent(moduleKey)}${suffix}`);
}

function channelUrl(pantinId: string, tag: string): string {
  return pantinUrl(pantinId, `/io/channels/${encodeURIComponent(tag)}`);
}

export function ioRoutes(send: SendJson, fetchFunction: FetchFunction): IoRoutes {
  const answer = IoMappingResponseSchema;
  return {
    // The core names the file after the Pantin (Content-Disposition); so does this.
    fetchIoGvl: async (pantinId) => {
      const response = await sendRequest(fetchFunction, pantinUrl(pantinId, "/io/gvl"), {
        method: "GET",
      });
      if (!response.ok) {
        throw await failureFromResponse(response);
      }
      return { fileName: `${pantinId}.gvl`, text: await response.text() };
    },
    fetchIoCsv: async (pantinId) => {
      const response = await sendRequest(fetchFunction, pantinUrl(pantinId, "/io/csv"), {
        method: "GET",
      });
      if (!response.ok) {
        throw await failureFromResponse(response);
      }
      // Response.text() would drop the byte order mark; ignoreBOM keeps it.
      const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
      return { fileName: `${pantinId}-io.csv`, text: decoder.decode(await response.arrayBuffer()) };
    },
    getIoMapping: (pantinId) => send(pantinUrl(pantinId, "/io"), jsonRequest("GET"), answer),
    createIoModule: async (pantinId, request) => {
      const valid = validInputOrThrow(CreateIoModuleRequestSchema, request);
      return send(pantinUrl(pantinId, "/io/modules"), jsonRequest("POST", valid), answer);
    },
    updateIoModule: async (pantinId, moduleKey, request) => {
      const valid = validInputOrThrow(UpdateIoModuleRequestSchema, request);
      return send(moduleUrl(pantinId, moduleKey), jsonRequest("PATCH", valid), answer);
    },
    deleteIoModule: (pantinId, moduleKey) =>
      send(moduleUrl(pantinId, moduleKey), jsonRequest("DELETE"), answer),
    createIoChannels: async (pantinId, moduleKey, request) => {
      const valid = validInputOrThrow(CreateIoChannelsRequestSchema, request);
      return send(moduleUrl(pantinId, moduleKey, "/channels"), jsonRequest("POST", valid), answer);
    },
    updateIoChannel: async (pantinId, tag, request) => {
      const valid = validInputOrThrow(UpdateIoChannelRequestSchema, request);
      return send(channelUrl(pantinId, tag), jsonRequest("PATCH", valid), answer);
    },
    deleteIoChannel: (pantinId, tag) =>
      send(channelUrl(pantinId, tag), jsonRequest("DELETE"), answer),
  };
}
