import { DRIVE_PARAMETERS, type DriveType, type PantinDocument } from "@pantin/protocol";
import { PantinApiError } from "../api-transport.ts";
import { actuatorsFedBy } from "../device-selection.ts";
import {
  buildDriveRequest,
  driveFormFor,
  initialDriveForm,
  withDriveFormType,
  withDriveFormValue,
} from "../drives/drive-form.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import { refreshFaults } from "./drive-commands.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The inspector (ADR 0022, 0028, 0030): opening it, and the drive form. Commands and
// faults are in drive-commands.ts.

export function toggleInspector(store: ViewerStore): void {
  const open = !store.state.inspectorOpen;
  store.update({
    ...store.state,
    inspectorOpen: open,
    driveForm: open ? store.state.driveForm : null,
  });
  if (open) {
    void refreshFaults(store);
  }
}

export function openDriveForm(store: ViewerStore, driveId: string | null): void {
  const document = store.state.openPantin?.document;
  if (document === undefined) {
    return;
  }
  const drive = document.drives.find((candidate) => candidate.id === driveId);
  const driveForm =
    drive === undefined ? initialDriveForm(document) : driveFormFor(drive, document);
  store.update({ ...store.state, driveForm, message: null });
}

export function cancelDriveForm(store: ViewerStore): void {
  store.update({ ...store.state, driveForm: null });
}

// Typing keeps the text without a redraw: the input already shows it.
export function editDriveName(store: ViewerStore, name: string): void {
  const form = store.state.driveForm;
  if (form !== null) {
    store.state = { ...store.state, driveForm: { ...form, name } };
  }
}

export function editDriveParameter(store: ViewerStore, field: string, text: string): void {
  const form = store.state.driveForm;
  if (form !== null) {
    store.state = { ...store.state, driveForm: withDriveFormValue(form, field, text) };
  }
}

function parseDriveType(raw: string): DriveType | null {
  return Object.keys(DRIVE_PARAMETERS).find((type): type is DriveType => type === raw) ?? null;
}

export function changeDriveType(store: ViewerStore, raw: string): void {
  const form = store.state.driveForm;
  const type = parseDriveType(raw);
  if (form !== null && type !== null) {
    store.update({ ...store.state, driveForm: withDriveFormType(form, type) });
  }
}

export function changeDriveAssembly(store: ViewerStore, assembly: string): void {
  const form = store.state.driveForm;
  if (form !== null) {
    store.update({ ...store.state, driveForm: { ...form, assembly } });
  }
}

export async function submitDriveForm(store: ViewerStore): Promise<void> {
  const { driveForm: form, openPantin: open } = store.state;
  if (form === null || open === null) {
    return;
  }
  const built = buildDriveRequest(form, open.document);
  if (!built.ok) {
    store.update({
      ...store.state,
      message: errorMessage("message.driveInvalid", {}, built.message),
    });
    return;
  }
  const { driveId } = form;
  const saved = await editPantin(store, open.id, (pantinId) =>
    driveId === null
      ? store.ports.api.createDrive(pantinId, built.request)
      : store.ports.api.updateDrive(pantinId, driveId, built.request),
  );
  if (saved !== undefined) {
    const key = driveId === null ? "message.driveCreated" : "message.driveUpdated";
    store.update({
      ...store.state,
      driveForm: null,
      message: infoMessage(key, { name: saved.name }),
    });
  }
}

// Undone by discarding the unsaved changes, like any edit.
export async function deleteDrive(store: ViewerStore, driveId: string): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  let refusal: unknown = null;
  const deleted = await editPantin(store, open.id, async (pantinId) => {
    try {
      return await store.ports.api.deleteDrive(pantinId, driveId);
    } catch (error) {
      refusal = error;
      throw error;
    }
  });
  if (deleted !== undefined) {
    await refreshFaults(store);
    store.update({ ...store.state, message: infoMessage("message.driveDeleted") });
  } else {
    explainRefusedDelete(store, open.document, driveId, refusal);
  }
}

// The core refuses a drive that still feeds actuators (ADR 0028 point 10) with
// a conflict. The document says which actuators to detach first, so the message
// names them as links (ADR 0030 point 4), under the core's own text as detail.
// Any other failure keeps the message the store already shows.
function explainRefusedDelete(
  store: ViewerStore,
  document: PantinDocument,
  driveId: string,
  failure: unknown,
): void {
  const drive = document.drives.find((candidate) => candidate.id === driveId);
  const fed = actuatorsFedBy(document, driveId);
  const isConflict =
    failure instanceof PantinApiError && failure.kind === "api" && failure.code === "conflict";
  if (isConflict && drive !== undefined && fed.length > 0) {
    store.update({
      ...store.state,
      message: errorMessage("message.driveInUse", { name: drive.name }, failure.message, fed),
    });
  }
}
