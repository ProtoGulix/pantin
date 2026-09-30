// Small helpers every drive type's behaviour.ts uses (ADR 0022 point 6). Plain
// numbers only, so that a drive type folder depends on nothing but this
// package. The step contract itself is in behaviour-step-common.ts.

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
