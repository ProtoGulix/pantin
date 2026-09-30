import {
  type Actuator,
  type CreateActuatorRequest,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { parseWithSchema } from "./validation.ts";

// Adding and changing actuators in a document (ADR 0028), as pure functions.
// The document schema checks the rest: a known assembly and drive, a feed
// that covers the actuator's ports in matching domains, movable joints moved
// once, one unit per actuator and per servo drive.

function validatedActuator(document: PantinDocument, id: string, context: string) {
  const updated = parseWithSchema(PantinDocumentSchema, document, context);
  const stored = updated.actuators.find((candidate) => candidate.id === id);
  if (stored === undefined) {
    throw new Error(`Actuator "${id}" vanished while validating the document.`);
  }
  return { document: updated, actuator: stored };
}

export function findActuator(document: PantinDocument, actuatorId: string): Actuator {
  const actuator = document.actuators.find((candidate) => candidate.id === actuatorId);
  if (actuator === undefined) {
    throw new ApiError("not_found", `This Pantin has no actuator "${actuatorId}".`);
  }
  return actuator;
}

function withActuator(document: PantinDocument, actuator: Actuator): PantinDocument {
  const exists = document.actuators.some((candidate) => candidate.id === actuator.id);
  const actuators = exists
    ? document.actuators.map((candidate) => (candidate.id === actuator.id ? actuator : candidate))
    : [...document.actuators, actuator];
  return { ...document, actuators };
}

/** Its id comes from its name, unique among actuators. */
export function addActuatorToDocument(document: PantinDocument, request: CreateActuatorRequest) {
  const baseId = slugifyDisplayName(request.name, "actuator");
  const id = makeUniqueId(baseId, new Set(document.actuators.map((actuator) => actuator.id)));
  const added = withActuator(document, { id, ...request });
  return validatedActuator(added, id, "The new actuator");
}

// Every field but the id may change, the type, the feed and the joints
// included: a new feed replaces the previous one (ADR 0028 point 9).
export function updateActuatorInDocument(
  document: PantinDocument,
  actuatorId: string,
  request: CreateActuatorRequest,
) {
  findActuator(document, actuatorId);
  const changed = withActuator(document, { id: actuatorId, ...request });
  return validatedActuator(changed, actuatorId, "The changed actuator");
}

export function deleteActuatorFromDocument(document: PantinDocument, actuatorId: string) {
  findActuator(document, actuatorId);
  return {
    ...document,
    actuators: document.actuators.filter((actuator) => actuator.id !== actuatorId),
  };
}
