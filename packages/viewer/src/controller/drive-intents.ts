import {
  cancelDriveForm,
  changeDriveAssembly,
  changeDriveType,
  deleteDrive,
  editDriveName,
  editDriveParameter,
  openDriveForm,
  openDriveFormForJoint,
  submitDriveForm,
  toggleDriveJoint,
  toggleDrivePanel,
} from "./drive-actions.ts";
import {
  setDriveUnresponsive,
  setJointJammed,
  toggleBitTag,
  writeFloatTag,
} from "./drive-commands.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The intents of the drives panel (ADR 0022), for createPanelIntents.
export function driveIntents(store: ViewerStore) {
  return {
    toggleDrivePanel: () => toggleDrivePanel(store),
    openDriveForm: (driveId: string | null) => openDriveForm(store, driveId),
    openDriveFormForJoint: (nodeId: string) => openDriveFormForJoint(store, nodeId),
    cancelDriveForm: () => cancelDriveForm(store),
    editDriveName: (name: string) => editDriveName(store, name),
    editDriveParameter: (field: string, text: string) => editDriveParameter(store, field, text),
    changeDriveType: (type: string) => changeDriveType(store, type),
    changeDriveAssembly: (assembly: string) => changeDriveAssembly(store, assembly),
    toggleDriveJoint: (jointId: string, on: boolean) => toggleDriveJoint(store, jointId, on),
    submitDriveForm: () => void submitDriveForm(store),
    deleteDrive: (driveId: string) => void deleteDrive(store, driveId),
    setDriveUnresponsive: (driveId: string, on: boolean) =>
      void setDriveUnresponsive(store, driveId, on),
    setJointJammed: (jointId: string, on: boolean) => void setJointJammed(store, jointId, on),
    toggleBitTag: (tagName: string) => void toggleBitTag(store, tagName),
    writeFloatTag: (tagName: string, text: string) => void writeFloatTag(store, tagName, text),
  };
}
