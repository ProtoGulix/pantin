import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ActuatorIdSchema,
  BodyIdSchema,
  DriveIdSchema,
  JointIdSchema,
  KeySchema,
  type PantinId,
  PantinIdSchema,
  SensorIdSchema,
  TagNameSchema,
} from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import type { PantinService } from "../service/pantin-service.ts";
import type { PoseStreamRegistry } from "./pose-stream-registry.ts";

// What a route handler receives, and the URL parameter parsers they share.

export type RouteContext = {
  service: PantinService;
  poseStreams: PoseStreamRegistry;
  maxImportBytes: number;
  request: IncomingMessage;
  response: ServerResponse;
  parameters: Record<string, string>;
  query: URLSearchParams;
};

export type Route = {
  method: string;
  pattern: readonly string[];
  handle: (context: RouteContext) => Promise<void>;
};

export function pantinIdOf(context: RouteContext): PantinId {
  return parseWithSchema(PantinIdSchema, context.parameters.pantinId, "The Pantin id in the URL");
}

export function bodyIdOf(context: RouteContext): string {
  return parseWithSchema(BodyIdSchema, context.parameters.bodyId, "The body id in the URL");
}

export function jointIdOf(context: RouteContext): string {
  return parseWithSchema(JointIdSchema, context.parameters.jointId, "The joint id in the URL");
}

export function driveIdOf(context: RouteContext): string {
  return parseWithSchema(DriveIdSchema, context.parameters.driveId, "The drive id in the URL");
}

export function actuatorIdOf(context: RouteContext): string {
  return parseWithSchema(
    ActuatorIdSchema,
    context.parameters.actuatorId,
    "The actuator id in the URL",
  );
}

export function sensorIdOf(context: RouteContext): string {
  return parseWithSchema(SensorIdSchema, context.parameters.sensorId, "The sensor id in the URL");
}

export function assemblyKeyOf(context: RouteContext): string {
  return parseWithSchema(KeySchema, context.parameters.assemblyKey, "The assembly key in the URL");
}

export function tagNameOf(context: RouteContext): string {
  return parseWithSchema(TagNameSchema, context.parameters.tagName, "The tag name in the URL");
}
