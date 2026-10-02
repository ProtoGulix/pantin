import type { PoseSnapshot } from "@pantin/protocol";

// Smooths the pose stream (ADR 0015): the core sends about 30 snapshots per
// second, the screen draws at 60 Hz or more. Pure: the clock is a parameter.
// Nothing here predicts motion; between two snapshots it only blends them, and
// past the blend it holds the last pose (a stale stream shows a still scene,
// never an extrapolated one).

/** Duration over which one snapshot blends into the next (1/30 s). */
export const INTERPOLATION_PERIOD_MS = 1000 / 30;

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export interface InterpolatedPose {
  translation: Vec3;
  rotation: Quat;
}

interface Timed {
  receivedAtMs: number;
  poses: Map<string, InterpolatedPose>;
}

// Above this cosine the two rotations are so close that slerp's sin(angle)
// divisor loses all precision; a normalised lerp is then indistinguishable.
const NEARLY_PARALLEL = 0.9995;

/** Writes the shortest-path spherical interpolation of a and b into out. */
function slerpInto(out: Quat, a: Quat, b: Quat, alpha: number): void {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  // q and -q are the same rotation: flip b to take the short way round.
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  let weightA = 1 - alpha;
  let weightB = alpha;
  if (dot < NEARLY_PARALLEL) {
    const angle = Math.acos(Math.min(dot, 1));
    const inverseSine = 1 / Math.sin(angle);
    weightA = Math.sin((1 - alpha) * angle) * inverseSine;
    weightB = Math.sin(alpha * angle) * inverseSine;
  }
  for (let index = 0; index < 4; index += 1) {
    out[index] = weightA * (a[index] ?? 0) + weightB * sign * (b[index] ?? 0);
  }
  const length = Math.hypot(out[0], out[1], out[2], out[3]);
  if (length > 0) {
    for (let index = 0; index < 4; index += 1) {
      out[index] = (out[index] ?? 0) / length;
    }
  }
}

function copyPoses(snapshot: PoseSnapshot): Map<string, InterpolatedPose> {
  const poses = new Map<string, InterpolatedPose>();
  for (const body of snapshot.bodies) {
    poses.set(body.bodyId, {
      translation: [...body.translation],
      rotation: [...body.rotation],
    });
  }
  return poses;
}

export type PoseVisitor = (bodyId: string, pose: InterpolatedPose) => void;

export class PoseInterpolator {
  private previous: Timed | null = null;
  private latest: Timed | null = null;
  // Reused for every body of every sample: visitors must not keep it.
  private readonly scratch: InterpolatedPose = {
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  };

  // The new blend starts from what is on screen now, not from the previous
  // target: a snapshot arriving mid-blend must not make bodies jump forward.
  push(snapshot: PoseSnapshot, nowMs: number): void {
    this.previous =
      this.latest === null ? null : { receivedAtMs: nowMs, poses: this.shownAt(nowMs) };
    this.latest = { receivedAtMs: nowMs, poses: copyPoses(snapshot) };
  }

  /**
   * The latest snapshot's pose of a body, not the blend: for a body that
   * appears after the snapshot arrived. Read only; undefined before the first
   * snapshot or for a body it does not list.
   */
  latestPose(bodyId: string): InterpolatedPose | undefined {
    return this.latest?.poses.get(bodyId);
  }

  reset(): void {
    this.previous = null;
    this.latest = null;
  }

  /**
   * Calls `visit` for every body of the latest snapshot with its pose at
   * `nowMs`. A body absent from the previous snapshot appears at its latest
   * pose; a body absent from the latest one is no longer visited, so the
   * caller's last applied pose stays.
   */
  sample(nowMs: number, visit: PoseVisitor): void {
    const { latest, previous } = this;
    if (latest === null) {
      return;
    }
    const elapsed = nowMs - latest.receivedAtMs;
    const alpha = Math.min(Math.max(elapsed / INTERPOLATION_PERIOD_MS, 0), 1);
    for (const [bodyId, target] of latest.poses) {
      const source = previous?.poses.get(bodyId);
      if (source === undefined || alpha >= 1) {
        visit(bodyId, target);
        continue;
      }
      this.blend(source, target, alpha);
      visit(bodyId, this.scratch);
    }
  }

  private shownAt(nowMs: number): Map<string, InterpolatedPose> {
    const shown = new Map<string, InterpolatedPose>();
    this.sample(nowMs, (bodyId, pose) => {
      shown.set(bodyId, { translation: [...pose.translation], rotation: [...pose.rotation] });
    });
    return shown;
  }

  private blend(source: InterpolatedPose, target: InterpolatedPose, alpha: number): void {
    const { translation } = this.scratch;
    for (let axis = 0; axis < 3; axis += 1) {
      const from = source.translation[axis] ?? 0;
      translation[axis] = from + ((target.translation[axis] ?? 0) - from) * alpha;
    }
    slerpInto(this.scratch.rotation, source.rotation, target.rotation, alpha);
  }
}
