import {
  addEndSwitches,
  cancelSensorForm,
  changeSensorAssembly,
  changeSensorJoint,
  changeSensorType,
  deleteSensor,
  editSensorName,
  editSensorParameter,
  openSensorForm,
  openSensorFormForJoint,
  submitSensorForm,
} from "./sensor-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The intents of the sensors section (ADR 0023), for createPanelIntents.
export function sensorIntents(store: ViewerStore) {
  return {
    openSensorForm: (sensorId: string | null) => openSensorForm(store, sensorId),
    openSensorFormForJoint: (nodeId: string) => openSensorFormForJoint(store, nodeId),
    addEndSwitches: (nodeId: string) => void addEndSwitches(store, nodeId),
    cancelSensorForm: () => cancelSensorForm(store),
    editSensorName: (name: string) => editSensorName(store, name),
    editSensorParameter: (key: string, text: string) => editSensorParameter(store, key, text),
    changeSensorType: (type: string) => changeSensorType(store, type),
    changeSensorJoint: (jointId: string) => changeSensorJoint(store, jointId),
    changeSensorAssembly: (assembly: string) => changeSensorAssembly(store, assembly),
    submitSensorForm: () => void submitSensorForm(store),
    deleteSensor: (sensorId: string) => void deleteSensor(store, sensorId),
  };
}
