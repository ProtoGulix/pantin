import type {
  AcPowerState,
  PneumaticState,
  PortState,
  ServoState,
} from "@pantin/drive-types/ports";

// What every actuator type's behaviour.ts uses: motion helpers and port
// readers, plain numbers only. The motion helpers mirror those of
// @pantin/drive-types behaviour-common.ts, which this package may not import
// (behaviours never cross packages, ADR 0028 point 3).

export interface JointMotion {
  // In the joint coordinate's unit (metre or radian), and per second.
  position: number;
  velocity: number;
  // The joint's limits; infinite for a joint without limits.
  lower: number;
  upper: number;
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

type Ports = Readonly<Record<string, PortState>> | null;

// The readers answer undefined for a missing port or one of another domain:
// the feed rules keep that from happening, and the behaviours then hold.

export function pneumaticPort(ports: Ports, name: string): PneumaticState | undefined {
  const state = ports?.[name];
  return typeof state === "string" ? state : undefined;
}

export function acPowerPort(ports: Ports, name: string): AcPowerState | undefined {
  const state = ports?.[name];
  return typeof state === "object" && "direction" in state ? state : undefined;
}

export function servoPort(ports: Ports, name: string): ServoState | undefined {
  const state = ports?.[name];
  return typeof state === "object" && "setpoint" in state ? state : undefined;
}
