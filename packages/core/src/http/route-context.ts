import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyIdSchema, JointIdSchema, type PantinId, PantinIdSchema } from "@pantin/protocol";
import { parseWithSchema } from "../domain/validation.ts";
import type { PantinService } from "../service/pantin-service.ts";

// What a route handler receives, and the URL parameter parsers they share.

export type RouteContext = {
  service: PantinService;
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
