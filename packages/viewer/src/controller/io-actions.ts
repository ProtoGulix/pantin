import type { IoMappingResponse } from "@pantin/protocol";
import { createTranslator, type MessageKey } from "../i18n/translate.ts";
import {
  type IoEditParse,
  type IoNumberField,
  parseChannelEdit,
  parseModuleEdit,
} from "../io/io-edits.ts";
import { withMapping } from "../io/io-state.ts";
import { errorMessage } from "../messages.ts";
import { loadIoMapping } from "./io-load.ts";
import { refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The I/O view (ADR 0049 points 4 and 11). Every route answers the whole
// mapping, and the Pantin is read again for `unsavedChanges`, as after a drive
// edit, so that Save and Discard follow.

// `selectKey` follows a renamed module: the old key is gone from the answer.
async function editMapping(
  store: ViewerStore,
  edit: (pantinId: string) => Promise<IoMappingResponse>,
  selectKey?: string,
): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const done = await store.run(
    async () => ({
      mapping: await edit(open.id),
      pantin: await store.ports.api.getPantin(open.id),
    }),
    (current, { mapping, pantin }) => {
      const shown = store.applyIfStillRequested(current, pantin);
      if (shown === current) {
        return shown;
      }
      const io = selectKey === undefined ? shown.io : { ...shown.io, selectedModuleKey: selectKey };
      return { ...shown, io: withMapping(io, open.id, mapping) };
    },
  );
  if (done === undefined) {
    // A refused edit leaves the typed text on screen: read the core's value again.
    await loadIoMapping(store);
  }
  await refreshPantinList(store);
}

/** Entering the view reads the mapping; leaving it keeps the last one for the way back. */
export function enterIoLayout(store: ViewerStore): void {
  void loadIoMapping(store);
}

function selectModule(store: ViewerStore, moduleKey: string): void {
  store.update({ ...store.state, io: { ...store.state.io, selectedModuleKey: moduleKey } });
}

// Selects the cell's module, then asks the view to focus the cell.
function focusProblem(store: ViewerStore, moduleKey: string | null, cellId: string): void {
  const { io } = store.state;
  store.update({
    ...store.state,
    io: {
      ...io,
      selectedModuleKey: moduleKey ?? io.selectedModuleKey,
      focus: { cellId, serial: (io.focus?.serial ?? 0) + 1 },
    },
  });
}

// A refused number says so before anything is sent, and the cell shows the core's value again.
const NUMBER_LABEL_KEYS: Readonly<Record<IoNumberField, MessageKey>> = {
  port: "io.settings.port",
  unitId: "io.settings.unitId",
  watchdogMilliseconds: "io.settings.watchdogMilliseconds",
  address: "io.column.address",
};

function reportInvalidNumber(store: ViewerStore, field: IoNumberField): void {
  const label = createTranslator(store.state.language)(NUMBER_LABEL_KEYS[field]);
  store.update({
    ...store.state,
    message: errorMessage("message.io.integerExpected", { field: label }),
  });
  void loadIoMapping(store);
}

function send<Request>(
  store: ViewerStore,
  parsed: IoEditParse<Request>,
  call: (pantinId: string, request: Request) => Promise<IoMappingResponse>,
  selectKey?: string,
): void {
  if (parsed.kind === "request") {
    const { request } = parsed;
    void editMapping(store, (id) => call(id, request), selectKey);
  } else if (parsed.kind === "invalidNumber") {
    reportInvalidNumber(store, parsed.field);
  }
}

function editModule(store: ViewerStore, moduleKey: string, field: string, text: string): void {
  const parsed = parseModuleEdit(field, text);
  const renamed = parsed.kind === "request" ? parsed.request.key : undefined;
  send(
    store,
    parsed,
    (id, request) => store.ports.api.updateIoModule(id, moduleKey, request),
    renamed,
  );
}

function editChannel(store: ViewerStore, tag: string, field: string, text: string): void {
  send(store, parseChannelEdit(field, text), (id, request) =>
    store.ports.api.updateIoChannel(id, tag, request),
  );
}

export function ioIntents(store: ViewerStore) {
  const api = () => store.ports.api;
  return {
    selectIoModule: (moduleKey: string) => selectModule(store, moduleKey),
    focusIoProblem: (moduleKey: string | null, cellId: string) =>
      focusProblem(store, moduleKey, cellId),
    // The first one creates io.json; the core proposes key and port.
    addIoModule: () => void editMapping(store, (id) => api().createIoModule(id, {})),
    editIoModule: (moduleKey: string, field: string, text: string) =>
      editModule(store, moduleKey, field, text),
    removeIoModule: (moduleKey: string) =>
      void editMapping(store, (id) => api().deleteIoModule(id, moduleKey)),
    mapIoTags: (moduleKey: string, tags: readonly string[]) =>
      void editMapping(store, (id) => api().createIoChannels(id, moduleKey, { tags: [...tags] })),
    editIoChannel: (tag: string, field: string, text: string) =>
      editChannel(store, tag, field, text),
    // A PATCH with `tag` derives zone and type again (ADR 0049 point 4).
    reassignIoChannel: (tag: string) =>
      void editMapping(store, (id) => api().updateIoChannel(id, tag, { tag })),
    unmapIoChannel: (tag: string) =>
      void editMapping(store, (id) => api().deleteIoChannel(id, tag)),
  };
}
