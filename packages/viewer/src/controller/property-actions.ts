import type { EditTarget } from "../properties/property-rows.ts";
import { commitKeyEdit } from "./assembly-actions.ts";
import { updateJointField } from "./joint-actions.ts";
import { renameNode } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

/** Applies a committed properties-grid edit to whatever its target designates. */
export async function commitPropertyEdit(
  store: ViewerStore,
  target: EditTarget,
  value: string,
): Promise<void> {
  if (target.kind === "rename") {
    await renameNode(store, target.nodeId, value);
  } else if (target.kind === "jointField") {
    await updateJointField(store, target, value);
  } else {
    await commitKeyEdit(store, target, value);
  }
}
