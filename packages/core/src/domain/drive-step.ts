import { stepDrive } from "@pantin/drive-types/behaviours";
import type { PantinDocument } from "@pantin/protocol";
import { sortedById } from "./ids.ts";
import { currentJointPosition } from "./kinematics.ts";
import type { SimulationState, SteppedState } from "./simulation-state.ts";

// The drive half of a simulation step (ADR 0028 points 7 and 11): each drive,
// in id order, turns its commands into port states, feedback and diagnostics.
// An unresponsive drive is not stepped: its port states, feedback and
// diagnostics stay as they were (ADR 0022 point 7, ADR 0028 point 11).

export type DriveOutputs = Pick<
  SteppedState,
  "driveStates" | "drivePortStates" | "driveFeedback" | "driveDiagnostics"
>;

// The joints a drive moves in the end, through the actuators it feeds, at the
// end of the previous step: a servo drive reads its motor's encoder one step
// late (ADR 0028 point 7).
function movedJointPositions(
  document: PantinDocument,
  driveId: string,
  state: SimulationState,
): number[] {
  const jointsById = new Map(document.joints.map((joint) => [joint.id, joint]));
  return sortedById(document.actuators)
    .filter((actuator) => actuator.feed?.drive === driveId)
    .flatMap((actuator) => actuator.joints)
    .flatMap((jointId) => {
      const joint = jointsById.get(jointId);
      return joint === undefined ? [] : [currentJointPosition(joint, state.jointPositions)];
    });
}

function keepFrozen(outputs: DriveOutputs, driveId: string, state: SimulationState): void {
  const copy = <Value>(from: ReadonlyMap<string, Value>, into: Map<string, Value>) => {
    const value = from.get(driveId);
    if (value !== undefined) {
      into.set(driveId, value);
    }
  };
  copy(state.driveStates, outputs.driveStates);
  copy(state.drivePortStates, outputs.drivePortStates);
  copy(state.driveFeedback, outputs.driveFeedback);
  copy(state.driveDiagnostics, outputs.driveDiagnostics);
}

export function stepDrives(
  document: PantinDocument,
  state: SimulationState,
  dt: number,
): DriveOutputs {
  const outputs: DriveOutputs = {
    driveStates: new Map(),
    drivePortStates: new Map(),
    driveFeedback: new Map(),
    driveDiagnostics: new Map(),
  };
  for (const drive of sortedById(document.drives)) {
    if (state.unresponsiveDriveIds.has(drive.id)) {
      keepFrozen(outputs, drive.id, state);
      continue;
    }
    const output = stepDrive({
      fields: drive,
      commands: state.driveCommands.get(drive.id) ?? {},
      state: state.driveStates.get(drive.id) ?? {},
      jointPositions: movedJointPositions(document, drive.id, state),
      dt,
    });
    outputs.driveStates.set(drive.id, output.state);
    outputs.drivePortStates.set(drive.id, output.ports);
    outputs.driveFeedback.set(drive.id, output.feedback);
    outputs.driveDiagnostics.set(drive.id, output.diagnostics);
  }
  return outputs;
}
