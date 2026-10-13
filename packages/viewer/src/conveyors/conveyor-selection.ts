import { type Selection, selectedDeviceOf } from "../selection.ts";
import { isConveyorKind } from "./conveyor-kinds.ts";
import { objectKey } from "./pose-feed.ts";

/** The key ("kind:id") of the selected belt, guide, emitter, absorber or presence sensor, or null. */
export function selectedConveyorKey(selection: Selection | null): string | null {
  const device = selectedDeviceOf(selection);
  return device !== null && isConveyorKind(device.kind) ? objectKey(device.kind, device.id) : null;
}
