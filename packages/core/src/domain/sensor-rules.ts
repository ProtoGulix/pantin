import {
  type CreateSensorRequest,
  type PantinDocument,
  PantinDocumentSchema,
  type Sensor,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { keyTaken, tagKeyOwners } from "./tag-keys.ts";
import { parseWithSchema } from "./validation.ts";

// Adding and changing sensors in a document (ADR 0023), as pure functions,
// like drives (drive-rules.ts). The document schema checks the rest: a known
// assembly and a movable joint.

function validatedSensor(document: PantinDocument, id: string, context: string) {
  const updated = parseWithSchema(PantinDocumentSchema, document, context);
  const stored = updated.sensors.find((candidate) => candidate.id === id);
  if (stored === undefined) {
    throw new Error(`Sensor "${id}" vanished while validating the document.`);
  }
  return { document: updated, sensor: stored };
}

function findSensor(document: PantinDocument, sensorId: string): Sensor {
  const sensor = document.sensors.find((candidate) => candidate.id === sensorId);
  if (sensor === undefined) {
    throw new ApiError("not_found", `This Pantin has no sensor "${sensorId}".`);
  }
  return sensor;
}

function withSensor(document: PantinDocument, sensor: Sensor): PantinDocument {
  const exists = document.sensors.some((candidate) => candidate.id === sensor.id);
  const sensors = exists
    ? document.sensors.map((candidate) => (candidate.id === sensor.id ? sensor : candidate))
    : [...document.sensors, sensor];
  return { ...document, sensors };
}

/** Its id and tag key come from its name, unique among sensors and tag owners. */
export function addSensorToDocument(document: PantinDocument, request: CreateSensorRequest) {
  const baseKey = slugifyDisplayName(request.name, "sensor");
  const id = makeUniqueId(baseKey, new Set(document.sensors.map((sensor) => sensor.id)));
  const tagKey = makeUniqueId(baseKey, new Set(tagKeyOwners(document, request.assembly).keys()));
  return validatedSensor(withSensor(document, { id, tagKey, ...request }), id, "The new sensor");
}

// Every field but the id and the tag key may change, the type included; in
// another assembly the tag key must be free (no automatic suffix, ADR 0019).
export function updateSensorInDocument(
  document: PantinDocument,
  sensorId: string,
  request: CreateSensorRequest,
) {
  const existing = findSensor(document, sensorId);
  const owner = tagKeyOwners(document, request.assembly, { sensorId }).get(existing.tagKey);
  if (owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Tag key "${existing.tagKey}" of sensor "${sensorId}" is already used by ${owner} in assembly "${request.assembly}". Rename one of the tag keys first.`,
    );
  }
  const sensor = { id: sensorId, tagKey: existing.tagKey, ...request };
  return validatedSensor(withSensor(document, sensor), sensorId, "The changed sensor");
}

export function deleteSensorFromDocument(document: PantinDocument, sensorId: string) {
  findSensor(document, sensorId);
  return { ...document, sensors: document.sensors.filter((sensor) => sensor.id !== sensorId) };
}

export function renameSensorTagKey(document: PantinDocument, sensorId: string, tagKey: string) {
  const sensor = findSensor(document, sensorId);
  const taken = tagKeyOwners(document, sensor.assembly, { sensorId });
  const owner = taken.get(tagKey);
  if (owner !== undefined) {
    const takenKeys = new Set([...taken.keys(), sensor.tagKey]);
    throw keyTaken(tagKey, `${owner} in assembly "${sensor.assembly}"`, takenKeys);
  }
  return withSensor(document, { ...sensor, tagKey });
}
