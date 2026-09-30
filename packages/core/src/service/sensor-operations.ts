import type {
  CreateSensorRequest,
  PantinId,
  PantinResponse,
  RenamedTagsResponse,
  Sensor,
} from "@pantin/protocol";
import {
  addSensorToDocument,
  deleteSensorFromDocument,
  renameSensorTagKey,
  updateSensorInDocument,
} from "../domain/sensor-rules.ts";
import { renamedTags } from "../domain/tags.ts";
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import type { ServiceContext } from "./open-pantins.ts";
import { toResponse } from "./open-pantins.ts";

// Sensors of an open Pantin (ADR 0023). A changed or deleted sensor forgets
// its last output (ADR 0025), so that a new type or new zones start afresh.

export function sensorOperations(context: ServiceContext) {
  return {
    createSensor: async (pantinId: PantinId, request: CreateSensorRequest): Promise<Sensor> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const { document, sensor } = addSensorToDocument(openPantin.document, request);
      openPantin.document = document;
      return sensor;
    },
    updateSensor: async (pantinId: PantinId, sensorId: string, request: CreateSensorRequest) => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const { document, sensor } = updateSensorInDocument(openPantin.document, sensorId, request);
      openPantin.document = document;
      openPantin.sensorOutputs.delete(sensorId);
      return sensor;
    },
    deleteSensor: async (pantinId: PantinId, sensorId: string): Promise<PantinResponse> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      openPantin.document = deleteSensorFromDocument(openPantin.document, sensorId);
      openPantin.sensorOutputs.delete(sensorId);
      return toResponse(pantinId, openPantin);
    },
    renameSensorTagKey: async (pantinId: PantinId, sensorId: string, tagKey: string) => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const before = openPantin.document;
      openPantin.document = renameSensorTagKey(before, sensorId, tagKey);
      const answer: RenamedTagsResponse = {
        pantin: toResponse(pantinId, openPantin),
        renamedTags: renamedTags(before, openPantin.document),
      };
      return answer;
    },
  };
}
