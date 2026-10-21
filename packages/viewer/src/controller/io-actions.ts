import type { IoMappingResponse, IoTagOwner } from "@pantin/protocol";
import { TRANSPORT_KINDS, type TransportKind } from "@pantin/transport-types/schemas";
import { type IoEditParse, parseChannelEdit, parseModuleEdit } from "../io/io-edits.ts";
import { withMapping } from "../io/io-state.ts";
import { fieldLabel } from "../io/io-transport-view.ts";
import { describeFailure, errorMessage } from "../messages.ts";
import { selectIoOwner, showDeviceInIo, showTagInIo } from "./io-link-actions.ts";
import { loadIoMapping, retryIoMapping } from "./io-load.ts";
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
      return { ...shown, io: withMapping(io, pantin, mapping) };
    },
  );
  if (done === undefined) {
    // A refused edit leaves the typed text on screen: read the core's value again.
    await loadIoMapping(store);
  }
  await refreshPantinList(store);
}

// Not `store.run`: a download changes nothing, so it must not disable the
// menus. A refusal (409 for an invalid mapping) shows the core's problems.
async function exportMappingFile(
  store: ViewerStore,
  fetchFile: (pantinId: string) => Promise<{ fileName: string; text: string }>,
): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  try {
    const file = await fetchFile(open.id);
    store.ports.saveTextFile(file.fileName, file.text);
  } catch (error) {
    store.update({ ...store.state, message: describeFailure(error) });
  }
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
function reportInvalidNumber(store: ViewerStore, kind: TransportKind, field: string): void {
  const label = fieldLabel(kind, field, store.state.language);
  store.update({
    ...store.state,
    message: errorMessage("message.io.integerExpected", { field: label }),
  });
  void loadIoMapping(store);
}

// A module's transport kind decides how its fields are read (ADR 0064 point 14).
function kindOfModule(store: ViewerStore, moduleKey: string): TransportKind | null {
  const module = store.state.io.mapping?.modules.find((candidate) => candidate.key === moduleKey);
  return module?.transport.kind ?? null;
}

function send<Request>(
  store: ViewerStore,
  kind: TransportKind,
  parsed: IoEditParse<Request>,
  call: (pantinId: string, request: Request) => Promise<IoMappingResponse>,
  selectKey?: string,
): void {
  if (parsed.kind === "request") {
    const { request } = parsed;
    void editMapping(store, (id) => call(id, request), selectKey);
  } else if (parsed.kind === "invalidNumber") {
    reportInvalidNumber(store, kind, parsed.field);
  }
}

function editModule(store: ViewerStore, moduleKey: string, field: string, text: string): void {
  const kind = kindOfModule(store, moduleKey);
  if (kind === null) {
    return;
  }
  const parsed = parseModuleEdit(kind, field, text);
  const renamed = parsed.kind === "request" ? parsed.request.key : undefined;
  send(
    store,
    kind,
    parsed,
    (id, request) => store.ports.api.updateIoModule(id, moduleKey, request),
    renamed,
  );
}

function editChannel(
  store: ViewerStore,
  moduleKey: string,
  tag: string,
  field: string,
  text: string,
): void {
  const kind = kindOfModule(store, moduleKey);
  if (kind === null) {
    return;
  }
  send(store, kind, parseChannelEdit(kind, field, text), (id, request) =>
    store.ports.api.updateIoChannel(id, moduleKey, tag, request),
  );
}

// The registry never lists zero kinds: a transport folder is what makes a kind exist.
const defaultKind = (): TransportKind => TRANSPORT_KINDS[0];

export function ioIntents(store: ViewerStore) {
  const api = () => store.ports.api;
  return {
    selectIoModule: (moduleKey: string) => selectModule(store, moduleKey),
    focusIoProblem: (moduleKey: string | null, cellId: string) =>
      focusProblem(store, moduleKey, cellId),
    // The first one creates io.json; the core proposes key and port.
    addIoModule: (kind: TransportKind = defaultKind()) =>
      void editMapping(store, (id) => api().createIoModule(id, { transport: { kind } })),
    editIoModule: (moduleKey: string, field: string, text: string) =>
      editModule(store, moduleKey, field, text),
    removeIoModule: (moduleKey: string) =>
      void editMapping(store, (id) => api().deleteIoModule(id, moduleKey)),
    mapIoTags: (moduleKey: string, tags: readonly string[]) =>
      void editMapping(store, (id) => api().createIoChannels(id, moduleKey, { tags: [...tags] })),
    editIoChannel: (moduleKey: string, tag: string, field: string, text: string) =>
      editChannel(store, moduleKey, tag, field, text),
    // A PATCH with `tag` derives the transport fields again (ADR 0049 point 4).
    reassignIoChannel: (moduleKey: string, tag: string) =>
      void editMapping(store, (id) => api().updateIoChannel(id, moduleKey, tag, { tag })),
    unmapIoChannel: (moduleKey: string, tag: string) =>
      void editMapping(store, (id) => api().deleteIoChannel(id, moduleKey, tag)),
    exportIoGvl: () => void exportMappingFile(store, (id) => store.ports.api.fetchIoGvl(id)),
    exportIoCsv: () => void exportMappingFile(store, (id) => store.ports.api.fetchIoCsv(id)),
    retryIoMapping: () => void retryIoMapping(store),
    selectIoOwner: (owner: IoTagOwner) => selectIoOwner(store, owner),
    showTagInIo: (tag: string) => void showTagInIo(store, tag),
    showDeviceInIo: (nodeId: string) => void showDeviceInIo(store, nodeId),
  };
}
