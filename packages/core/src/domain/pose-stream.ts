import type { PoseSnapshot } from "@pantin/protocol";
import { STEP_SECONDS } from "./fixed-step.ts";

// When the pose stream sends a snapshot (ADR 0015 point 3). While running, time
// is counted in steps, so the decision does not depend on wall-clock jitter.

export const SNAPSHOT_PERIOD_SECONDS = 1 / 30;
// Rounded because 1/30 divided by 1/120 is not exactly 4 in floating point.
export const SNAPSHOT_PERIOD_STEPS = Math.round(SNAPSHOT_PERIOD_SECONDS / STEP_SECONDS);

// stepCount is left out: it always advances, and only motion is worth a send.
export function hasMoved(previous: PoseSnapshot, current: PoseSnapshot): boolean {
  return (
    JSON.stringify([previous.jointPositions, previous.bodies]) !==
    JSON.stringify([current.jointPositions, current.bodies])
  );
}

// A step count that went back means the Pantin was discarded and reopened:
// the stream must not wait for the old count to be reached again.
export function isSnapshotPeriodElapsed(lastSentStepCount: number, stepCount: number): boolean {
  return stepCount < lastSentStepCount || stepCount - lastSentStepCount >= SNAPSHOT_PERIOD_STEPS;
}

export function shouldSendSnapshot(lastSent: PoseSnapshot, current: PoseSnapshot): boolean {
  return (
    isSnapshotPeriodElapsed(lastSent.stepCount, current.stepCount) && hasMoved(lastSent, current)
  );
}
