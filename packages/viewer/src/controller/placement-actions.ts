import { parseNumber } from "../joints/joint-form.ts";
import { errorMessage } from "../messages.ts";
import { fieldsToPlacement, placementToFields } from "../placement-units.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { editPantin } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Editing an assembly's placement by typing (ADR 0034 point 1). Like the other
// typed fields: one request per committed value, the Pantin read again after
// it, and bodies moving through the pose stream, never here. The request holds
// the whole placement, the five other values coming from the current document.

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
    store.update({ ...store.state, message: errorMessage("placement.invalid") });
    return;
  }
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
