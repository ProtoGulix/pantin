import { type JointMotion, stepDrive } from "@pantin/drive-types/behaviours";
import type { Drive, Joint, PantinDocument } from "@pantin/protocol";
import { clampJointPosition } from "./joint-types/registry.ts";
import { currentJointPosition } from "./kinematics.ts";
import { applyQueuedSetpoints } from "./simulation-step.ts";
import { drivenJointIds } from "./tags.ts";

// One simulation step of a Pantin (ADR 0022 point 6), as a pure function:
// each drive moves its joints through its type's behaviour, the other joints
// follow their setpoint tag (ADR 0012). Faults (point 7): a jammed joint keeps
// its position; an unresponsive drive runs on its frozen commands, and its
// feedback stays as it was.

type Values = Readonly<Record<string, number>>;

export interface SimulationState {
  jointPositions: ReadonlyMap<string, number>;
  jointVelocities: ReadonlyMap<string, number>;
  queuedSetpoints: ReadonlyMap<string, number>;
  driveCommands: ReadonlyMap<string, Values>;
  // Commands kept when a drive became unresponsive, by drive.
  frozenDriveCommands: ReadonlyMap<string, Values>;
  driveStates: ReadonlyMap<string, Values>;
  driveFeedback: ReadonlyMap<string, Values>;
  jammedJointIds: ReadonlySet<string>;
}

// Fresh maps, which the caller may keep and change.
export interface SteppedState {
  jointPositions: Map<string, number>;
  jointVelocities: Map<string, number>;
  driveStates: Map<string, Values>;
  driveFeedback: Map<string, Values>;
}

// Limits by clamping the infinities: no joint type is named here, and a joint
// without limits (continuous) gets infinite ones.
function motionOf(joint: Joint, state: SimulationState): JointMotion {
  return {
    position: currentJointPosition(joint, state.jointPositions),
    velocity: state.jointVelocities.get(joint.id) ?? 0,
    lower: clampJointPosition(joint, Number.NEGATIVE_INFINITY),
    upper: clampJointPosition(joint, Number.POSITIVE_INFINITY),
  };
}

function stepOneDrive(
  document: PantinDocument,
  drive: Drive,
  state: SimulationState,
  next: { positions: Map<string, number>; velocities: Map<string, number> },
  dt: number,
) {
  const joints = drive.joints.flatMap((id) => document.joints.filter((joint) => joint.id === id));
  const frozen = state.frozenDriveCommands.get(drive.id);
  const output = stepDrive({
    fields: drive,
    commands: frozen ?? state.driveCommands.get(drive.id) ?? {},
    state: state.driveStates.get(drive.id) ?? {},
    joints: joints.map((joint) => motionOf(joint, state)),
    dt,
  });
  for (const [index, joint] of joints.entries()) {
    const moved = output.joints[index];
    const jammed = state.jammedJointIds.has(joint.id);
    if (moved !== undefined && !jammed) {
      next.positions.set(joint.id, moved.position);
    }
    next.velocities.set(joint.id, moved === undefined || jammed ? 0 : moved.velocity);
  }
  const feedback = frozen === undefined ? output.feedback : state.driveFeedback.get(drive.id);
  return { state: output.state, feedback: feedback ?? {} };
}

export function stepSimulation(
  document: PantinDocument,
  state: SimulationState,
  dt: number,
): SteppedState {
  const driven = drivenJointIds(document);
  const undriven = new Map(
    [...state.queuedSetpoints].filter(
      ([jointId]) => !driven.has(jointId) && !state.jammedJointIds.has(jointId),
    ),
  );
  const positions = applyQueuedSetpoints(document, state.jointPositions, undriven);
  const next = { positions, velocities: new Map(state.jointVelocities) };
  const driveStates = new Map<string, Values>();
  const driveFeedback = new Map<string, Values>();
  for (const drive of document.drives) {
    const stepped = stepOneDrive(document, drive, state, next, dt);
    driveStates.set(drive.id, stepped.state);
    driveFeedback.set(drive.id, stepped.feedback);
  }
  return {
    jointPositions: next.positions,
    jointVelocities: next.velocities,
    driveStates,
    driveFeedback,
  };
}
