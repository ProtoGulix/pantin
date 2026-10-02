import { ApiError } from "../../errors.ts";
import type { RigidTransform } from "../rigid-transform.ts";
import type { ConnectorFrame } from "./geometry.ts";

// The motion of an alignment kind (ADR 0035 point 9): a pure function from
// the connector frames of the picks, in the order of the kind's descriptor,
// to the rigid motion of the moving assembly, in the Pantin frame.

// Absent parameters are false or 0 by then.
export type AlignmentParameters = { flip: boolean; offset: number; rotation: number };

export type AlignmentMotion = (
  frames: readonly ConnectorFrame[],
  parameters: AlignmentParameters,
) => RigidTransform;

// The descriptor fixes how many frames a motion gets; the route checks it.
export function frameAt(frames: readonly ConnectorFrame[], index: number): ConnectorFrame {
  const frame = frames[index];
  if (frame === undefined) {
    throw new Error(`Alignment motion expected a frame at index ${index}.`);
  }
  return frame;
}

export function alignmentRefused(message: string): ApiError {
  return new ApiError("invalid_request", message);
}
