import type { PortState } from "./ports.ts";
import type { DriveDiagnostic } from "./schema-common.ts";

// The step contract of the drive types of ADR 0028 (point 3), next to the
// contract of ADR 0022 (behaviour-common.ts) until the core switches over.
// Plain numbers only. A behaviour answers port states and feedback; it never
// sees a joint's limits and never moves a joint.

export interface DriveStepInput<Fields> {
  fields: Fields;
  // The current value of each command tag, by member; a bit is 0 or 1.
  commands: Readonly<Record<string, number>>;
  // The drive's own state from the previous step (a spool position), by name.
  state: Readonly<Record<string, number>>;
  // Positions of the joints the drive moves in the end, as at the end of the
  // previous step (ADR 0028 point 7). Only a servo drive reads them.
  jointPositions: readonly number[];
  // Seconds of simulated time since the previous step.
  dt: number;
}

export interface DriveStepOutput {
  // The state of each output port, by port name (ports.ts).
  ports: Record<string, PortState>;
  state: Record<string, number>;
  // The value of each feedback tag, by member.
  feedback: Record<string, number>;
  // Set and cleared at each step, never saved (ADR 0028 point 5).
  diagnostics: DriveDiagnostic[];
}

// A method, not a function type: the registry relies on method parameters
// being compared bivariantly, as for the contract of ADR 0022.
export interface DriveStepBehaviour<Fields> {
  step(input: DriveStepInput<Fields>): DriveStepOutput;
}
