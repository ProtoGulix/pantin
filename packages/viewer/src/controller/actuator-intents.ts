import {
  cancelActuatorForm,
  changeActuatorAssembly,
  changeActuatorDrive,
  changeActuatorPort,
  changeActuatorType,
  editActuatorName,
  editActuatorParameter,
  openActuatorForm,
  openActuatorFormForJoint,
  submitActuatorForm,
  toggleActuatorJoint,
} from "./actuator-actions.ts";
import { requestDeviceDelete } from "./device-deletion-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The intents of the actuators section (ADR 0028), for createPanelIntents.
export function actuatorIntents(store: ViewerStore) {
  return {
    openActuatorForm: (actuatorId: string | null) => openActuatorForm(store, actuatorId),
    openActuatorFormForJoint: (nodeId: string) => openActuatorFormForJoint(store, nodeId),
    cancelActuatorForm: () => cancelActuatorForm(store),
    editActuatorName: (name: string) => editActuatorName(store, name),
    editActuatorParameter: (field: string, text: string) =>
      editActuatorParameter(store, field, text),
    changeActuatorType: (type: string) => changeActuatorType(store, type),
    changeActuatorAssembly: (assembly: string) => changeActuatorAssembly(store, assembly),
    changeActuatorDrive: (driveId: string) => changeActuatorDrive(store, driveId),
    changeActuatorPort: (inputPort: string, outputPort: string) =>
      changeActuatorPort(store, inputPort, outputPort),
    toggleActuatorJoint: (jointId: string, on: boolean) => toggleActuatorJoint(store, jointId, on),
    submitActuatorForm: () => void submitActuatorForm(store),
    deleteActuator: (actuatorId: string) =>
      requestDeviceDelete(store, { kind: "actuator", id: actuatorId }),
  };
}
