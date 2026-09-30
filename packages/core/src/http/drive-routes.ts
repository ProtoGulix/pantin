import {
  CreateDriveRequestSchema,
  DriveFaultRequestSchema,
  JointFaultRequestSchema,
  RenameTagKeyRequestSchema,
  UpdateDriveRequestSchema,
} from "@pantin/protocol";
import { type Parser, parseWithSchema } from "../domain/validation.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import {
  driveIdOf,
  jointIdOf,
  pantinIdOf,
  type Route,
  type RouteContext,
} from "./route-context.ts";

// Drive and fault routes (ADR 0022); the contract is in drive-api.ts.

const DRIVE = ["pantins", ":pantinId", "drives", ":driveId"];

async function bodyOf<Output>(
  context: RouteContext,
  schema: Parser<Output>,
  what: string,
): Promise<Output> {
  return parseWithSchema(schema, await readJsonBody(context.request), what);
}

export const DRIVE_ROUTES: readonly Route[] = [
  {
    method: "POST",
    pattern: ["pantins", ":pantinId", "drives"],
    handle: async (context) => {
      const request = await bodyOf(context, CreateDriveRequestSchema, "The drive");
      const drive = await context.service.createDrive(pantinIdOf(context), request);
      sendJson(context.response, 201, { drive });
    },
  },
  {
    method: "PATCH",
    pattern: DRIVE,
    handle: async (context) => {
      const request = await bodyOf(context, UpdateDriveRequestSchema, "The drive");
      const drive = await context.service.updateDrive(
        pantinIdOf(context),
        driveIdOf(context),
        request,
      );
      sendJson(context.response, 200, { drive });
    },
  },
  {
    method: "DELETE",
    pattern: DRIVE,
    handle: async (context) =>
      sendJson(
        context.response,
        200,
        await context.service.deleteDrive(pantinIdOf(context), driveIdOf(context)),
      ),
  },
  {
    method: "PUT",
    pattern: [...DRIVE, "tag-key"],
    handle: async (context) => {
      const { tagKey } = await bodyOf(context, RenameTagKeyRequestSchema, "The new tag key");
      const answer = await context.service.renameDriveTagKey(
        pantinIdOf(context),
        driveIdOf(context),
        tagKey,
      );
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "faults"],
    handle: async (context) =>
      sendJson(context.response, 200, await context.service.getFaults(pantinIdOf(context))),
  },
  {
    method: "PUT",
    pattern: ["pantins", ":pantinId", "joints", ":jointId", "fault"],
    handle: async (context) => {
      const { fault } = await bodyOf(context, JointFaultRequestSchema, "The fault");
      const answer = await context.service.setJointFault(
        pantinIdOf(context),
        jointIdOf(context),
        fault,
      );
      sendJson(context.response, 200, answer);
    },
  },
  {
    method: "PUT",
    pattern: [...DRIVE, "fault"],
    handle: async (context) => {
      const { fault } = await bodyOf(context, DriveFaultRequestSchema, "The fault");
      const answer = await context.service.setDriveFault(
        pantinIdOf(context),
        driveIdOf(context),
        fault,
      );
      sendJson(context.response, 200, answer);
    },
  },
];
