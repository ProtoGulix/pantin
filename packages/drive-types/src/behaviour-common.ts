// What every drive type's behaviour.ts uses (ADR 0022 point 6): the shape of
// one simulation step and small motion helpers. Plain numbers only, so that a
// drive type folder depends on nothing but this package.

export interface JointMotion {
  // In the joint coordinate's unit (metre or radian), and per second.
  position: number;
  velocity: number;
  // The joint's limits; infinite for a joint without limits.
  lower: number;
  upper: number;
}

export interface DriveStepInput<Fields> {
  fields: Fields;
  // The current value of each command tag, by member; a bit is 0 or 1.
  commands: Readonly<Record<string, number>>;
  // The drive's own state from the previous step (a motor's speed), by name.
  state: Readonly<Record<string, number>>;
  joints: readonly JointMotion[];
  // Seconds of simulated time since the previous step.
  dt: number;
}

export interface DriveStepOutput {
  // One entry per input joint, in the same order.
  joints: { position: number; velocity: number }[];
  state: Record<string, number>;
  // The value of each feedback tag, by member.
  feedback: Record<string, number>;
}

// A method, not a function type: the registry (behaviours.ts) relies on
// method parameters being compared bivariantly.
export interface DriveBehaviour<Fields> {
  step(input: DriveStepInput<Fields>): DriveStepOutput;
}

/** A command bit reads as set from 0.5 up: the protocol only lets 0 or 1 in. */
export function isSet(commands: Readonly<Record<string, number>>, member: string): boolean {
  return (commands[member] ?? 0) >= 0.5;
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

/**
 * Moves `value` toward `target` by at most `maxChange`. Within reach it
 * answers `target` itself: `value + (target - value)` may miss it by a float
 * step, and callers compare with it.
 */
export function rampToward(value: number, target: number, maxChange: number): number {
  const gap = target - value;
  return Math.abs(gap) <= maxChange ? target : value + Math.sign(gap) * maxChange;
}

/** Travels toward a target at a constant speed, stopping on it. */
export function travelAtSpeed(joint: JointMotion, target: number, speed: number, dt: number) {
  const goal = clamp(target, joint.lower, joint.upper);
  const position = rampToward(joint.position, goal, speed * dt);
  const velocity = position === goal ? 0 : Math.sign(goal - joint.position) * speed;
  return { position, velocity };
}

/** Moves at a velocity, stopped by the limits: a motor against an end stop. */
export function moveAtVelocity(joint: JointMotion, velocity: number, dt: number) {
  const free = joint.position + velocity * dt;
  const position = clamp(free, joint.lower, joint.upper);
  return { position, velocity: position === free ? velocity : 0 };
}

export function holdPosition(joint: JointMotion) {
  return { position: joint.position, velocity: 0 };
}
