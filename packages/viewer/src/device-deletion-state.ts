import { devicesOfKind, type PendingDeviceDeletion } from "./pending-device-deletion.ts";
import { NO_CLOSE_PROMPT, type ViewerState } from "./viewer-state.ts";

// Deleting a drive, an actuator or a sensor asks first, like a body or a joint.
// Pure state changes; the question is built in panel/device-deletion-prompt.ts.

function exists(state: ViewerState, device: PendingDeviceDeletion): boolean {
  const document = state.openPantin?.document;
  return (
    document !== undefined &&
    devicesOfKind(document, device.kind).some((item) => item.id === device.id)
  );
}

/** Asks to confirm the deletion; one prompt at a time, so the others are dropped. */
export function withDeviceDeleteRequested(
  state: ViewerState,
  device: PendingDeviceDeletion,
): ViewerState {
  // The close prompt came first and stays; a device that is gone has nothing to confirm.
  if (state.closePrompt || !exists(state, device)) {
    return state;
  }
  return {
    ...state,
    pendingDeleteDevice: device,
    pendingDeleteBodyId: null,
    pendingDeleteJointId: null,
    pendingDeleteAssembly: null,
    pendingGroup: null,
    pendingOrphanCleanup: null,
    pendingRedundantJoints: null,
    pendingFeedReplacement: null,
    contextMenu: null,
    ...NO_CLOSE_PROMPT,
  };
}
