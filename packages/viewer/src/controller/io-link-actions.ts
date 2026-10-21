import type { IoMappingResponse, IoTagOwner } from "@pantin/protocol";
import { deviceExists } from "../device-selection.ts";
import { firstPlace, placeOfTag, type TagPlace, tagsOfOwner } from "../io/io-element-tags.ts";
import { ownerOfDevice, ownerOfSelection, targetOfOwner } from "../io/io-owner.ts";
import { isMappingCurrent } from "../io/io-state.ts";
import { jointNodeId, parseNodeId } from "../tree/node-ids.ts";
import { withRevealedDevice, withRevealedNode } from "../tree/tree-state.ts";
import { revealCentralView } from "./diagram-actions.ts";
import { ensureIoMapping } from "./io-load.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The links between the I/O view and the tree (ADR 0049 point 11, ADR 0047
// point 4): a tag selects its owner, and an element opens its tags in the
// view. The owner comes from the core's answer, never worked out here.

/**
 * Selects the owner of a clicked tag and unfolds the tree to it. The central
 * layout stays on the I/O view, so that the user keeps their place; the
 * inspector opens, where the owner's section lists the same tags.
 */
export function selectIoOwner(store: ViewerStore, owner: IoTagOwner): void {
  const open = store.state.openPantin;
  const target = targetOfOwner(owner);
  if (open === null) {
    return;
  }
  const { document } = open;
  if (target.kind === "joint") {
    if (document.joints.some((joint) => joint.id === target.jointId)) {
      const revealed = withRevealedNode(store.state, jointNodeId(open.id, target.jointId));
      store.update({ ...revealed, inspectorOpen: true });
    }
  } else if (deviceExists(document, target.device)) {
    store.update({ ...withRevealedDevice(store.state, target.device), inspectorOpen: true });
  }
}

// Shows the I/O view on a place: the module's table, or the unmapped list.
function showPlace(store: ViewerStore, place: TagPlace | null): void {
  revealCentralView(store, "io");
  const { io } = store.state;
  store.update({
    ...store.state,
    contextMenu: null,
    io: {
      ...io,
      selectedModuleKey: place?.moduleKey ?? io.selectedModuleKey,
      focus:
        place === null ? io.focus : { cellId: place.cellId, serial: (io.focus?.serial ?? 0) + 1 },
    },
  });
}

// The mapping as it is for the open Pantin now, or none: a stale or foreign
// one would point at cells that are not there (read it first with ensureIoMapping).
function currentMapping(store: ViewerStore): IoMappingResponse | null {
  return isMappingCurrent(store.state) ? store.state.io.mapping : null;
}

/** "Open in I/O" of the inspector: the selected element's tag, in its module's table. */
export async function showTagInIo(store: ViewerStore, tagName: string): Promise<void> {
  // The place is worked out after the read, which may come after the click.
  await ensureIoMapping(store);
  const owner = ownerOfSelection(store.state.selection);
  const tags =
    owner === null ? [] : tagsOfOwner(currentMapping(store), owner, store.state.language);
  showPlace(store, placeOfTag(tags, tagName));
}

/** "Show in I/O" of a device row: its first mapped tag, else the unmapped list. */
export async function showDeviceInIo(store: ViewerStore, nodeId: string): Promise<void> {
  const ref = parseNodeId(nodeId);
  const device = ref?.kind === "device" ? { kind: ref.deviceKind, id: ref.id } : null;
  const owner = device === null ? null : ownerOfDevice(device);
  await ensureIoMapping(store);
  showPlace(
    store,
    owner === null
      ? null
      : firstPlace(tagsOfOwner(currentMapping(store), owner, store.state.language)),
  );
}
