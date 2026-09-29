import type { PoseSnapshot } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { INTERPOLATION_PERIOD_MS, PoseInterpolator } from "./pose-interpolation.ts";

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

function snapshot(
  bodies: { id: string; t?: [number, number, number]; q?: [number, number, number, number] }[],
): PoseSnapshot {
  return {
    stepCount: 0,
    jointPositions: [],
    bodies: bodies.map(({ id, t, q }) => ({
      bodyId: id,
      translation: t ?? [0, 0, 0],
      rotation: q ?? IDENTITY,
    })),
  };
}

function poseAt(interpolator: PoseInterpolator, nowMs: number, bodyId: string) {
  const found: { translation: number[]; rotation: number[] }[] = [];
  interpolator.sample(nowMs, (id, pose) => {
    if (id === bodyId) {
      found.push({ translation: [...pose.translation], rotation: [...pose.rotation] });
    }
  });
  return found[0] ?? null;
}

function about(axisIndex: 0 | 1 | 2, angle: number): [number, number, number, number] {
  const q: [number, number, number, number] = [0, 0, 0, Math.cos(angle / 2)];
  q[axisIndex] = Math.sin(angle / 2);
  return q;
}

describe("PoseInterpolator", () => {
  const start = 1000;

  function twoSnapshots(): PoseInterpolator {
    const interpolator = new PoseInterpolator();
    interpolator.push(snapshot([{ id: "a", t: [0, 0, 0], q: IDENTITY }]), 0);
    interpolator.push(snapshot([{ id: "a", t: [2, 4, 6], q: about(2, Math.PI / 2) }]), start);
    return interpolator;
  }

  it("shows nothing before the first snapshot and the snapshot itself after it", () => {
    const interpolator = new PoseInterpolator();
    expect(poseAt(interpolator, 0, "a")).toBeNull();
    interpolator.push(snapshot([{ id: "a", t: [1, 2, 3] }]), 0);
    expect(poseAt(interpolator, 5, "a")?.translation).toEqual([1, 2, 3]);
  });

  it("starts at the previous pose and ends at the latest one", () => {
    const interpolator = twoSnapshots();
    expect(poseAt(interpolator, start, "a")?.translation).toEqual([0, 0, 0]);
    const end = poseAt(interpolator, start + INTERPOLATION_PERIOD_MS, "a");
    // Not toEqual: 1000 + 1000/30 - 1000 need not divide back to exactly 1.
    expect(end?.translation[1]).toBeCloseTo(4, 9);
  });

  it("blends translation linearly and rotation spherically at the midpoint", () => {
    const pose = poseAt(twoSnapshots(), start + INTERPOLATION_PERIOD_MS / 2, "a");
    expect(pose?.translation[0]).toBeCloseTo(1, 12);
    expect(pose?.translation[2]).toBeCloseTo(3, 12);
    const expected = about(2, Math.PI / 4);
    for (const index of [0, 1, 2, 3]) {
      expect(pose?.rotation[index]).toBeCloseTo(expected[index] ?? 0, 12);
    }
  });
});

describe("PoseInterpolator, snapshot arriving mid-blend", () => {
  it("starts the new blend from the pose on screen, without jumping", () => {
    const interpolator = new PoseInterpolator();
    interpolator.push(snapshot([{ id: "a", t: [0, 0, 0] }]), 0);
    interpolator.push(snapshot([{ id: "a", t: [10, 0, 0] }]), 100);
    const midway = 100 + INTERPOLATION_PERIOD_MS / 2;
    expect(poseAt(interpolator, midway, "a")?.translation[0]).toBeCloseTo(5, 9);
    interpolator.push(snapshot([{ id: "a", t: [20, 0, 0] }]), midway);
    expect(poseAt(interpolator, midway, "a")?.translation[0]).toBeCloseTo(5, 9);
    const end = poseAt(interpolator, midway + INTERPOLATION_PERIOD_MS, "a");
    expect(end?.translation[0]).toBeCloseTo(20, 9);
  });
});

describe("PoseInterpolator edge cases", () => {
  const start = 1000;

  function twoSnapshots(): PoseInterpolator {
    const interpolator = new PoseInterpolator();
    interpolator.push(snapshot([{ id: "a", t: [0, 0, 0], q: IDENTITY }]), 0);
    interpolator.push(snapshot([{ id: "a", t: [2, 4, 6], q: about(2, Math.PI / 2) }]), start);
    return interpolator;
  }

  it("holds the last pose when the stream goes stale", () => {
    const interpolator = twoSnapshots();
    expect(poseAt(interpolator, start + 10_000, "a")?.translation).toEqual([2, 4, 6]);
  });

  it("takes the short way round when the quaternions have opposite signs", () => {
    const interpolator = new PoseInterpolator();
    const q = about(2, 0.2);
    interpolator.push(snapshot([{ id: "a", q: IDENTITY }]), 0);
    // -q is the same rotation as q: the midpoint must be about 0.1 rad, not ~pi.
    interpolator.push(snapshot([{ id: "a", q: [-q[0], -q[1], -q[2], -q[3]] }]), start);
    const pose = poseAt(interpolator, start + INTERPOLATION_PERIOD_MS / 2, "a");
    const angle =
      2 * Math.atan2(Math.abs(pose?.rotation[2] ?? 0), Math.abs(pose?.rotation[3] ?? 0));
    expect(angle).toBeCloseTo(0.1, 6);
  });

  it("shows a new body at its pose and stops visiting a vanished one", () => {
    const interpolator = new PoseInterpolator();
    interpolator.push(snapshot([{ id: "gone", t: [1, 1, 1] }]), 0);
    interpolator.push(snapshot([{ id: "new", t: [5, 5, 5] }]), start);
    const middle = start + INTERPOLATION_PERIOD_MS / 2;
    expect(poseAt(interpolator, middle, "new")?.translation).toEqual([5, 5, 5]);
    expect(poseAt(interpolator, middle, "gone")).toBeNull();
  });

  it("forgets everything on reset", () => {
    const interpolator = twoSnapshots();
    interpolator.reset();
    expect(poseAt(interpolator, start, "a")).toBeNull();
  });
});
