import { tagName } from "@pantin/protocol";
import {
  bodiesOfAssembly,
  conveyorFormOf,
  initialConveyorForm,
  parsePresenceType,
  withConveyorFormAssembly,
  withConveyorFormField,
  withConveyorFormType,
} from "../conveyors/conveyor-form.ts";
import { type ConveyorKind, findConveyor, SPAWN_MEMBER } from "../conveyors/conveyor-kinds.ts";
import { buildConveyorRequest } from "../conveyors/conveyor-request.ts";
import { errorMessage, infoMessage } from "../messages.ts";
import { withSelection } from "../tree/tree-state.ts";
import { removeConveyor, saveConveyor } from "./conveyor-calls.ts";
import { refreshFaults, refreshTagValues } from "./drive-commands.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The belts, guides, emitters, absorbers and presence sensors of the inspector
// (ADR 0043 point 13): the form, deletion, the emitter's "Créer un produit" and
// the simulation reset.

/** Opens the form on a new object of the kind, or on the stored one with this id. */
export function openConveyorForm(store: ViewerStore, kind: ConveyorKind, id: string | null): void {
  const document = store.state.openPantin?.document;
  if (document === undefined) {
    return;
  }
  const conveyorForm =
    id === null ? initialConveyorForm(kind, document) : conveyorFormOf(document, kind, id);
  if (conveyorForm !== null) {
    store.update({ ...store.state, inspectorOpen: true, conveyorForm, message: null });
  }
}

export function cancelConveyorForm(store: ViewerStore): void {
  store.update({ ...store.state, conveyorForm: null });
}

// Typing keeps the text without a redraw: the input already shows it.
export function editConveyorField(store: ViewerStore, fieldId: string, text: string): void {
  const form = store.state.conveyorForm;
  if (form !== null) {
    store.state = { ...store.state, conveyorForm: withConveyorFormField(form, fieldId, text) };
  }
}

export function changeConveyorType(store: ViewerStore, raw: string): void {
  const form = store.state.conveyorForm;
  const type = parsePresenceType(raw);
  if (form !== null && type !== null) {
    store.update({ ...store.state, conveyorForm: withConveyorFormType(form, type) });
  }
}

// Redrawn: the body picker lists the bodies of the new assembly.
export function changeConveyorAssembly(store: ViewerStore, assembly: string): void {
  const { conveyorForm: form, openPantin: open } = store.state;
  if (form !== null && open !== null) {
    const conveyorForm = withConveyorFormAssembly(form, assembly, open.document);
    store.update({ ...store.state, conveyorForm });
  }
}

export function changeConveyorBody(store: ViewerStore, bodyId: string): void {
  const { conveyorForm: form, openPantin: open } = store.state;
  const known = open !== null && form !== null && bodiesOfAssembly(open.document, form.assembly);
  if (form !== null && known !== false && (bodyId === "" || known.some((b) => b.id === bodyId))) {
    store.state = { ...store.state, conveyorForm: { ...form, body: bodyId } };
  }
}

export async function submitConveyorForm(store: ViewerStore): Promise<void> {
  const { conveyorForm: form, openPantin: open } = store.state;
  if (form === null || open === null) {
    return;
  }
  const built = buildConveyorRequest(form);
  if (!built.ok) {
    store.update({
      ...store.state,
      message: errorMessage("message.conveyorInvalid", {}, built.message),
    });
    return;
  }
  const created = form.id === null;
  await editPantin(
    store,
    open.id,
    (pantinId) => saveConveyor(store, pantinId, built.request, form.id),
    (state, saved) => ({
      ...withSelection(state, { kind: form.kind, id: saved.id }),
      conveyorForm: null,
      message: infoMessage(
        created
          ? (`message.${form.kind}.created` as const)
          : (`message.${form.kind}.updated` as const),
        { name: saved.name },
      ),
    }),
  );
}

// Undone by discarding the unsaved changes, like any edit. The core refuses a
// drum or a frame still in use and names who uses it.
export async function deleteConveyor(
  store: ViewerStore,
  kind: ConveyorKind,
  id: string,
): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  await editPantin(
    store,
    open.id,
    (pantinId) => removeConveyor(store, pantinId, kind, id),
    (state) => ({ ...state, message: infoMessage(`message.${kind}.deleted`) }),
  );
}

/**
 * Writes 0, 1, then 0 to the emitter's spawn tag, as a PLC pulse would (ADR 0043
 * point 5). The leading 0 makes the next click spawn even when the closing 0 of
 * the last one failed and left the tag at 1; writing 0 over 0 does nothing.
 */
export async function spawnProduct(store: ViewerStore, emitterId: string): Promise<void> {
  const open = store.state.openPantin;
  const emitter = open === null ? undefined : findConveyor(open.document, "emitter", emitterId);
  if (open === null || emitter === undefined) {
    return;
  }
  const tag = tagName(emitter.assembly, emitter.tagKey, SPAWN_MEMBER);
  await store.run(
    async () => {
      await store.ports.api.writeTag(open.id, tag, 0);
      await store.ports.api.writeTag(open.id, tag, 1);
      await store.ports.api.writeTag(open.id, tag, 0);
    },
    (current) => ({
      ...current,
      message: infoMessage("message.productRequested", { name: emitter.name }),
    }),
  );
}

/** Calls the reset route: products, commands and faults go, the unsaved edits and the clock stay. */
export async function resetSimulation(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const reset = await store.run(
    () => store.ports.api.resetPantin(open.id),
    (current, pantin) => ({
      ...store.applyIfStillRequested(current, pantin),
      message: infoMessage("message.simulationReset"),
    }),
  );
  if (reset !== undefined) {
    await Promise.all([refreshTagValues(store), refreshFaults(store)]);
  }
}
