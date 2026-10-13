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
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// I/O mapping routes of the API client (ADR 0049 point 4). Every answer is the
// whole mapping, so the viewer never patches its copy by hand.

export interface IoRoutes {
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

export function ioRoutes(send: SendJson): IoRoutes {
  const answer = IoMappingResponseSchema;
  return {
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
