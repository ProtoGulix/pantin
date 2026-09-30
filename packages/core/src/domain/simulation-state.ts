import type { PortState } from "@pantin/drive-types/ports";
import type { DriveDiagnostic } from "@pantin/drive-types/schemas";

// What one simulation step reads and answers (ADR 0028 point 11). Everything
// here is runtime state, never saved.

type Values = Readonly<Record<string, number>>;

// The state of each output port of a drive, by port name (ADR 0028 point 2).
export type PortStates = Readonly<Record<string, PortState>>;

export interface SimulationState {
  jointPositions: ReadonlyMap<string, number>;
  jointVelocities: ReadonlyMap<string, number>;
  queuedSetpoints: ReadonlyMap<string, number>;
  driveCommands: ReadonlyMap<string, Values>;
  // Drives that stopped answering: their port states and feedback stay as
  // they were at the last step before the fault.
  unresponsiveDriveIds: ReadonlySet<string>;
  driveStates: ReadonlyMap<string, Values>;
  drivePortStates: ReadonlyMap<string, PortStates>;
  driveFeedback: ReadonlyMap<string, Values>;
  driveDiagnostics: ReadonlyMap<string, readonly DriveDiagnostic[]>;
  jammedJointIds: ReadonlySet<string>;
}

// Fresh maps, which the caller may keep and change.
export interface SteppedState {
  jointPositions: Map<string, number>;
  jointVelocities: Map<string, number>;
  driveStates: Map<string, Values>;
  drivePortStates: Map<string, PortStates>;
  driveFeedback: Map<string, Values>;
  driveDiagnostics: Map<string, readonly DriveDiagnostic[]>;
}
