import type { Body } from "@pantin/protocol";
import { LengthUnitSchema, UpAxisSchema } from "@pantin/protocol";
import { pluralKey } from "../i18n/translate.ts";
import { buildImportQuery, createPendingImport } from "../import-options.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import { withImportedBodies, withImportFailed, withImportStarted } from "../viewer-state.ts";
import { editPantin, openPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The import flow: pick a file, adjust options in the inline form, send it.

export async function chooseImportFile(
  store: ViewerStore,
  file: File,
  targetPantinId: string | null,
): Promise<void> {
  const pendingImport = createPendingImport(file.name);
  if (pendingImport === null) {
    store.update({
      ...store.state,
      message: errorMessage("message.unsupportedFile", { fileName: file.name }),
    });
    return;
  }
  // From a context menu, the target Pantin may not be open yet.
  if (targetPantinId !== null && store.state.openPantin?.id !== targetPantinId) {
    await openPantin(store, targetPantinId);
  }
  if (store.state.openPantin === null) {
    return;
  }
  store.pendingImportFile = file;
  store.update({ ...store.state, pendingImport, message: null });
}

// Form values are external input: validated by the contract's schemas.
export function changeImportOptions(
  store: ViewerStore,
  rawUnit: string | undefined,
  rawUpAxis: string | undefined,
): void {
  const pendingImport = store.state.pendingImport;
  if (pendingImport === null) {
    return;
  }
  const unit = LengthUnitSchema.safeParse(rawUnit ?? pendingImport.unit);
  const upAxis = UpAxisSchema.safeParse(rawUpAxis ?? pendingImport.upAxis);
  if (!unit.success || !upAxis.success) {
    store.update({ ...store.state, message: errorMessage("message.invalidImportOption") });
    return;
  }
  store.update({
    ...store.state,
    pendingImport: { ...pendingImport, unit: unit.data, upAxis: upAxis.data },
  });
}

export function cancelImport(store: ViewerStore): void {
  store.pendingImportFile = null;
  store.update({ ...store.state, pendingImport: null, importInProgress: false });
}

export async function confirmImport(store: ViewerStore): Promise<void> {
  const file = store.pendingImportFile;
  const { pendingImport, openPantin: target, importInProgress } = store.state;
  // A STEP conversion can last minutes: a second click must not send it twice.
  if (file === null || pendingImport === null || target === null || importInProgress) {
    return;
  }
  store.update(withImportStarted(store.state));
  let importedBodies: Body[] | undefined;
  try {
    const bytes = await file.arrayBuffer();
    importedBodies = await editPantin(store, target.id, (pantinId) =>
      store.ports.api.importBodies(pantinId, buildImportQuery(pendingImport), bytes),
    );
  } finally {
    // Whatever happened, the form must never stay stuck in progress.
    store.update(
      importedBodies === undefined
        ? withImportFailed(store.state)
        : withImportedBodies(store.state, importedBodies),
    );
  }
  // The viewport frames every body once the new meshes are loaded.
  if (importedBodies !== undefined) {
    store.pendingImportFile = null;
    const count = importedBodies.length;
    store.update({
      ...store.state,
      message: infoMessage(pluralKey("message.imported", count), { count }),
    });
  }
}
