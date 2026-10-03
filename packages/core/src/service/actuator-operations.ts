import type { Actuator, CreateActuatorRequest, PantinId, PantinResponse } from "@pantin/protocol";
import {
  addActuatorToDocument,
  deleteActuatorFromDocument,
  findActuator,
  updateActuatorInDocument,
} from "../domain/actuator-rules.ts";
import { loadSettledPantin } from "./mesh-lifecycle.ts";
import { type OpenPantin, type ServiceContext, toResponse } from "./open-pantins.ts";

// Actuators of an open Pantin (ADR 0028). Every edit tidies the runtime state
// of the joints: one that no actuator moves any more stops, one that an
// actuator moves now forgets its setpoint (its tag is gone, ADR 0028 point 9).

export function tidyJoints(
  openPantin: OpenPantin,
  before: readonly string[],
  after: readonly string[],
) {
  for (const jointId of before.filter((id) => !after.includes(id))) {
    openPantin.jointVelocities.delete(jointId);
  }
  for (const jointId of after.filter((id) => !before.includes(id))) {
    openPantin.setpoints.delete(jointId);
    openPantin.queuedSetpoints.delete(jointId);
  }
}

export function actuatorOperations(context: ServiceContext) {
  return {
    createActuator: async (
      pantinId: PantinId,
      request: CreateActuatorRequest,
    ): Promise<Actuator> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const { document, actuator } = addActuatorToDocument(openPantin.document, request);
      openPantin.document = document;
      tidyJoints(openPantin, [], actuator.joints);
      return actuator;
    },
    updateActuator: async (
      pantinId: PantinId,
      actuatorId: string,
      request: CreateActuatorRequest,
    ): Promise<Actuator> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const before = findActuator(openPantin.document, actuatorId);
      const { document, actuator } = updateActuatorInDocument(
        openPantin.document,
        actuatorId,
        request,
      );
      openPantin.document = document;
      tidyJoints(openPantin, before.joints, actuator.joints);
      return actuator;
    },
    deleteActuator: async (pantinId: PantinId, actuatorId: string): Promise<PantinResponse> => {
      const openPantin = await loadSettledPantin(context, pantinId);
      const before = findActuator(openPantin.document, actuatorId);
      openPantin.document = deleteActuatorFromDocument(openPantin.document, actuatorId);
      tidyJoints(openPantin, before.joints, []);
      return toResponse(pantinId, openPantin);
    },
  };
}
