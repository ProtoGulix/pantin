import type { ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import {
  cancelConveyorForm,
  changeConveyorAssembly,
  changeConveyorBody,
  changeConveyorType,
  deleteConveyor,
  editConveyorField,
  openConveyorForm,
  resetSimulation,
  spawnProduct,
  submitConveyorForm,
} from "./conveyor-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The intents of the phase 6 objects (ADR 0043 point 13), for createPanelIntents.
export function conveyorIntents(store: ViewerStore) {
  return {
    openConveyorForm: (kind: ConveyorKind, id: string | null) => openConveyorForm(store, kind, id),
    cancelConveyorForm: () => cancelConveyorForm(store),
    editConveyorField: (fieldId: string, text: string) => editConveyorField(store, fieldId, text),
    changeConveyorType: (type: string) => changeConveyorType(store, type),
    changeConveyorAssembly: (assembly: string) => changeConveyorAssembly(store, assembly),
    changeConveyorBody: (bodyId: string) => changeConveyorBody(store, bodyId),
    submitConveyorForm: () => void submitConveyorForm(store),
    deleteConveyor: (kind: ConveyorKind, id: string) => void deleteConveyor(store, kind, id),
    spawnProduct: (emitterId: string) => void spawnProduct(store, emitterId),
    resetSimulation: () => void resetSimulation(store),
  };
}
