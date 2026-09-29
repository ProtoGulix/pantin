import type { PoseSnapshot } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { STEP_SECONDS } from "./fixed-step.ts";
import {
  hasMoved,
  isSnapshotPeriodElapsed,
  SNAPSHOT_PERIOD_STEPS,
  shouldSendSnapshot,
} from "./pose-stream.ts";

function snapshot(stepCount: number, position: number): PoseSnapshot {
  return {
    stepCount,
    jointPositions: [{ jointId: "stroke", position }],
    bodies: [{ bodyId: "carriage", translation: [position, 0, 0], rotation: [0, 0, 0, 1] }],
  };
}

describe("snapshot period", () => {
  it("is 1/30 s of simulated time, i.e. 4 steps", () => {
    expect(SNAPSHOT_PERIOD_STEPS).toBe(4);
    expect(SNAPSHOT_PERIOD_STEPS * STEP_SECONDS).toBeCloseTo(1 / 30, 12);
  });

  it("elapses after the period, not before", () => {
    expect(isSnapshotPeriodElapsed(10, 13)).toBe(false);
    expect(isSnapshotPeriodElapsed(10, 14)).toBe(true);
  });

  it("counts as elapsed when the step count went back", () => {
    expect(isSnapshotPeriodElapsed(10, 0)).toBe(true);
  });
});

describe("hasMoved", () => {
  it("ignores the step count", () => {
    expect(hasMoved(snapshot(0, 0.1), snapshot(50, 0.1))).toBe(false);
  });

  it("sees a joint position or a body pose change", () => {
    expect(hasMoved(snapshot(0, 0.1), snapshot(0, 0.2))).toBe(true);
    const rotated = { ...snapshot(0, 0.1), jointPositions: snapshot(0, 0.1).jointPositions };
    rotated.bodies = [{ bodyId: "carriage", translation: [0.1, 0, 0], rotation: [1, 0, 0, 0] }];
    expect(hasMoved(snapshot(0, 0.1), rotated)).toBe(true);
  });
});

describe("shouldSendSnapshot", () => {
  it("needs both the period and a change", () => {
    expect(shouldSendSnapshot(snapshot(0, 0), snapshot(4, 0.1))).toBe(true);
    expect(shouldSendSnapshot(snapshot(0, 0), snapshot(3, 0.1))).toBe(false);
    expect(shouldSendSnapshot(snapshot(0, 0.1), snapshot(40, 0.1))).toBe(false);
  });
});
