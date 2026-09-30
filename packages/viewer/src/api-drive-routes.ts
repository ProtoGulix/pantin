import {
  type CreateDriveRequest,
  CreateDriveRequestSchema,
  type Drive,
  DriveResponseSchema,
  type FaultsResponse,
  FaultsResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
  type RenamedTagsResponse,
  RenamedTagsResponseSchema,
  type Tag,
  type TagListResponse,
  TagListResponseSchema,
  TagResponseSchema,
  UpdateDriveRequestSchema,
  WriteTagRequestSchema,
} from "@pantin/protocol";
import { jsonRequest, pantinUrl, type SendJson, validInputOrThrow } from "./api-transport.ts";

// Drive, fault and tag routes of the API client (ADR 0012, ADR 0022).

export interface DriveRoutes {
  createDrive(pantinId: string, request: CreateDriveRequest): Promise<Drive>;
  // Every field but the id and the tag key; the type may change.
  updateDrive(pantinId: string, driveId: string, request: CreateDriveRequest): Promise<Drive>;
  deleteDrive(pantinId: string, driveId: string): Promise<PantinResponse>;
  renameDriveTagKey(
    pantinId: string,
    driveId: string,
    tagKey: string,
  ): Promise<RenamedTagsResponse>;
  getFaults(pantinId: string): Promise<FaultsResponse>;
  setJointFault(
    pantinId: string,
    jointId: string,
    fault: "none" | "jammed",
  ): Promise<FaultsResponse>;
  setDriveFault(
    pantinId: string,
    driveId: string,
    fault: "none" | "unresponsive",
  ): Promise<FaultsResponse>;
  listTags(pantinId: string): Promise<TagListResponse>;
  writeTag(pantinId: string, tagName: string, value: number): Promise<Tag>;
}

function driveUrl(pantinId: string, driveId: string, suffix = ""): string {
  return pantinUrl(pantinId, `/drives/${encodeURIComponent(driveId)}${suffix}`);
}

export function driveRoutes(send: SendJson): DriveRoutes {
  return {
    createDrive: async (pantinId, request) => {
      const valid = validInputOrThrow(CreateDriveRequestSchema, request);
      const url = pantinUrl(pantinId, "/drives");
      return (await send(url, jsonRequest("POST", valid), DriveResponseSchema)).drive;
    },
    updateDrive: async (pantinId, driveId, request) => {
      const valid = validInputOrThrow(UpdateDriveRequestSchema, request);
      const url = driveUrl(pantinId, driveId);
      return (await send(url, jsonRequest("PATCH", valid), DriveResponseSchema)).drive;
    },
    deleteDrive: (pantinId, driveId) =>
      send(driveUrl(pantinId, driveId), jsonRequest("DELETE"), PantinResponseSchema),
    // Sent as typed: the core suggests a valid key for a bad one (ADR 0019).
    renameDriveTagKey: (pantinId, driveId, tagKey) =>
      send(
        driveUrl(pantinId, driveId, "/tag-key"),
        jsonRequest("PUT", { tagKey }),
        RenamedTagsResponseSchema,
      ),
    getFaults: (pantinId) =>
      send(pantinUrl(pantinId, "/faults"), jsonRequest("GET"), FaultsResponseSchema),
    setJointFault: (pantinId, jointId, fault) =>
      send(
        pantinUrl(pantinId, `/joints/${encodeURIComponent(jointId)}/fault`),
        jsonRequest("PUT", { fault }),
        FaultsResponseSchema,
      ),
    setDriveFault: (pantinId, driveId, fault) =>
      send(
        driveUrl(pantinId, driveId, "/fault"),
        jsonRequest("PUT", { fault }),
        FaultsResponseSchema,
      ),
    listTags: (pantinId) =>
      send(pantinUrl(pantinId, "/tags"), jsonRequest("GET"), TagListResponseSchema),
    writeTag: async (pantinId, tagName, value) => {
      const valid = validInputOrThrow(WriteTagRequestSchema, { value });
      const url = pantinUrl(pantinId, `/tags/${encodeURIComponent(tagName)}`);
      return (await send(url, jsonRequest("PUT", valid), TagResponseSchema)).tag;
    },
  };
}
