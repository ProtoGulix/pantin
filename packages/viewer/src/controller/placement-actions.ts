import type { DraggedPlacement } from "../gizmo/dragged-placement.ts";
import { createLatestWinsSender, type LatestWinsSender } from "../gizmo/latest-wins-sender.ts";
import { parseNumber } from "../joints/joint-form.ts";
import { describeFailure } from "../messages.ts";
import { fieldsToPlacement, type PlacementField, placementToFields } from "../placement-units.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

function placementSenderOf(store: ViewerStore): LatestWinsSender<DraggedPlacement> {
  // Created on first use: it needs the store's API and message line.
  store.placementSender ??= createLatestWinsSender<DraggedPlacement>(
    async ({ pantinId, key, placement }) => {
      await store.ports.api.setAssemblyPlacement(pantinId, key, placement);
    },
    (error) => store.update({ ...store.state, message: describeFailure(error) }),
  );
  return store.placementSender;
}

// Editing an assembly's placement by typing (ADR 0034 point 1). Like the other
// typed fields: one request per committed value, the Pantin read again after
// it, and bodies moving through the pose stream, never here. The request holds
// the whole placement, the five other values coming from the current document.

/** Drops the refused text kept for a field, when it is that field's. */
export function clearInvalidPlacement(
  store: ViewerStore,
  target: { pantinId: string; key: string; field: PlacementField },
): void {
  const kept = store.state.placementInvalid;
  if (
    kept !== null &&
    kept.pantinId === target.pantinId &&
    kept.key === target.key &&
    kept.field === target.field
  ) {
    store.update({ ...store.state, placementInvalid: null });
  }
}

/** Sends the placement with one field replaced by the typed text (display units). */
export async function setPlacementField(
  store: ViewerStore,
  target: Extract<EditTarget, { kind: "assemblyPlacement" }>,
  text: string,
): Promise<void> {
  const open = store.state.openPantin;
  const assembly = open?.document.assemblies.find((candidate) => candidate.key === target.key);
  if (open === null || open.id !== target.pantinId || assembly === undefined) {
    return;
  }
  const typed = parseNumber(text);
  if (!Number.isFinite(typed)) {
    // The text stays in the field, marked; nothing is sent (ADR 0039 point 5).
    store.update({
      ...store.state,
      placementInvalid: { pantinId: open.id, key: assembly.key, field: target.field, text },
    });
    return;
  }
  clearInvalidPlacement(store, target);
  const edited = fieldsToPlacement({
    ...placementToFields(assembly.placement),
    [target.field]: typed,
  });
  // The half that was not typed is sent as stored, not recomposed from angles.
  const placement = target.field.startsWith("r")
    ? { translation: assembly.placement.translation, rotation: edited.rotation }
    : { translation: edited.translation, rotation: assembly.placement.rotation };
  await editPantin(store, open.id, (pantinId) =>
    store.ports.api.setAssemblyPlacement(pantinId, assembly.key, placement),
  );
}

// Dragging the gizmo (ADR 0034 points 4 and 7). Each value goes through one
// sender per store: one request in flight, the latest value replaces the one
// waiting (ADR 0016 point 5). Bodies move through the pose stream only; the
// document is read again once, when the drag is over.

/** A placement the gizmo asks for, in the frame of the anchor. */
export function dragPlacement(
  store: ViewerStore,
  assemblyKey: string,
  placement: RigidTransform,
): void {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  const [x, y, z] = placement.translation;
  const [qx, qy, qz, qw] = placement.rotation;
  const value: DraggedPlacement = {
    pantinId: open.id,
    key: assemblyKey,
    placement: { translation: [x, y, z], rotation: [qx, qy, qz, qw] },
  };
  placementSenderOf(store).push(value);
  // The fields follow the drag with the value just asked of the core, not a pose
  // computed here; the document read again replaces it on release.
  store.update({
    ...store.state,
    placementDraft: {
      pantinId: open.id,
      key: assemblyKey,
      fields: placementToFields(value.placement),
    },
  });
}

/** The drag ended or was cancelled: wait for the last request, read the Pantin, free the gizmo. */
export async function finishPlacementDrag(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const finishing = store.state.placementDraft;
  try {
    if (open !== null) {
      await editPantin(store, open.id, () => placementSenderOf(store).settled());
    }
  } finally {
    // A newer drag may have started meanwhile: its draft is not this one's to clear.
    if (store.state.placementDraft === finishing) {
      store.update({ ...store.state, placementDraft: null });
    }
  }
  store.ports.viewport().releasePlacementGizmo();
}
