import { z } from "zod";
import { BodyIdSchema, KeySchema } from "./ids.ts";

// A joint links two endpoints (ADR 0055 point 1): a body, or an assembly used
// as a group, which is one rigid piece. Body ids and assembly keys are
// separate spaces, so the kind is explicit.
export const JointEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("body"), id: BodyIdSchema }),
  z.object({ kind: z.literal("assembly"), key: KeySchema }),
]);
export type JointEndpoint = z.infer<typeof JointEndpointSchema>;

export function bodyEndpoint(id: string): JointEndpoint {
  return { kind: "body", id };
}

export function groupEndpoint(key: string): JointEndpoint {
  return { kind: "assembly", key };
}

/** One string per endpoint, for maps and sets: body ids and group keys never clash. */
export function endpointKey(endpoint: JointEndpoint): string {
  return endpoint.kind === "body" ? `body:${endpoint.id}` : `assembly:${endpoint.key}`;
}

/** For messages: `body "rod"` or `group "gripper"`. */
export function describeEndpoint(endpoint: JointEndpoint): string {
  return endpoint.kind === "body" ? `body "${endpoint.id}"` : `group "${endpoint.key}"`;
}

/**
 * The assembly whose frame an endpoint is expressed in: the assembly of a
 * body, the group itself. Undefined for an unknown body.
 */
export function endpointAssembly(
  endpoint: JointEndpoint,
  assemblyOfBody: ReadonlyMap<string, string>,
): string | undefined {
  return endpoint.kind === "body" ? assemblyOfBody.get(endpoint.id) : endpoint.key;
}

/** Like `endpointAssembly`, for a one-off lookup in a list of bodies. */
export function endpointAssemblyIn(
  endpoint: JointEndpoint,
  bodies: readonly { id: string; assembly: string }[],
): string | undefined {
  return endpoint.kind === "assembly"
    ? endpoint.key
    : bodies.find((body) => body.id === endpoint.id)?.assembly;
}

/** Whether the endpoint is the body `bodyId`. */
export function isBodyEndpoint(endpoint: JointEndpoint, bodyId: string): boolean {
  return endpoint.kind === "body" && endpoint.id === bodyId;
}
