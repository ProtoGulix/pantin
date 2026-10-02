import {
  ALIGNMENT_KINDS,
  type AlignRequest,
  type AlignResponse,
  type FaceFile,
  FaceFileSchema,
  type PantinDocument,
  PantinDocumentSchema,
  type PantinId,
  type Placement,
} from "@pantin/protocol";
import { ALIGNMENT_MOTIONS } from "../domain/alignment-kinds/registry.ts";
import {
  checkPickSides,
  connectorFrame,
  type RoledPick,
  roledPicks,
} from "../domain/alignment-picks.ts";
import { anchorOfAssembly } from "../domain/assembly-anchors.ts";
import { setAssemblyPlacement } from "../domain/assembly-edits.ts";
import { placementGivingPose } from "../domain/keep-displayed-pose.ts";
import { computeDisplacements, computePoses } from "../domain/kinematics.ts";
import {
  compose,
  IDENTITY_TRANSFORM,
  type RigidTransform,
  toPlacement,
} from "../domain/rigid-transform.ts";
import { parseWithSchema } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { loadSettledPantin, waitForImports } from "./mesh-lifecycle.ts";
import type { ServiceContext } from "./open-pantins.ts";

// Alignment by picked faces (ADR 0035 point 6): the core computes the rigid
// motion in the configuration on screen and stores only the placement that
// gives the moving assembly that motion.

// Displacements below this are rounding, not a joint away from 0.
const DISPLACEMENT_NOISE = 1e-12;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readFaceFiles(
  context: ServiceContext,
  pantinId: PantinId,
  document: PantinDocument,
  picks: readonly RoledPick[],
): Promise<Map<string, FaceFile>> {
  const faceFiles = new Map<string, FaceFile>();
  for (const { pick } of picks) {
    const body = document.bodies.find((candidate) => candidate.id === pick.body);
    if (pick.kind !== "face" || body === undefined || faceFiles.has(body.id)) {
      continue;
    }
    const text = await context.store.readFaceFile(pantinId, body.mesh);
    // A face file damaged on disk counts as none: the pick then says so.
    const parsed = FaceFileSchema.safeParse(text === undefined ? undefined : parseJson(text));
    if (parsed.success) {
      faceFiles.set(body.id, parsed.data);
    }
  }
  return faceFiles;
}

function isDisplaced({ rotation, translation }: RigidTransform): boolean {
  const [x, y, z] = rotation;
  return Math.max(...[x, y, z, ...translation].map(Math.abs)) > DISPLACEMENT_NOISE;
}

function findPose(poses: ReadonlyMap<string, RigidTransform>, bodyId: string): RigidTransform {
  return poses.get(bodyId) ?? IDENTITY_TRANSFORM;
}

// The placement that moves assembly `key` as the request asks, in the
// configuration given by `document` and `positions`.
function alignedPlacement(
  document: PantinDocument,
  key: string,
  request: AlignRequest,
  picks: readonly RoledPick[],
  faceFiles: ReadonlyMap<string, FaceFile>,
  positions: ReadonlyMap<string, number>,
): Placement {
  if (!document.assemblies.some((assembly) => assembly.key === key)) {
    throw new ApiError("not_found", `This Pantin has no assembly "${key}".`);
  }
  const keyBody = checkPickSides(document, key, picks);
  const poses = new Map(
    computePoses(document, positions).map(({ bodyId, rotation, translation }) => [
      bodyId,
      { rotation, translation },
    ]),
  );
  const frames = picks.map((roled) =>
    connectorFrame(roled, findPose(poses, roled.pick.body), faceFiles.get(roled.pick.body)),
  );
  const motion = ALIGNMENT_MOTIONS[request.kind](frames, {
    flip: request.flip ?? false,
    offset: request.offset ?? 0,
    rotation: request.rotation ?? 0,
  });
  const pose = compose(motion, findPose(poses, keyBody.id));
  return toPlacement(placementGivingPose(document, key, keyBody, pose, positions));
}

function isTargetDisplaced(
  document: PantinDocument,
  picks: readonly RoledPick[],
  positions: ReadonlyMap<string, number>,
): boolean {
  const displacements = computeDisplacements(document, positions);
  return picks.some(
    ({ pick, role }) =>
      role.side === "target" && isDisplaced(displacements.get(pick.body) ?? IDENTITY_TRANSFORM),
  );
}

export async function alignAssembly(
  context: ServiceContext,
  pantinId: PantinId,
  key: string,
  request: AlignRequest,
): Promise<AlignResponse> {
  const picks = roledPicks(request.picks, ALIGNMENT_KINDS[request.kind].picks);
  const openPantin = await loadSettledPantin(context, pantinId);
  const faceFiles = await readFaceFiles(context, pantinId, openPantin.document, picks);
  // An import may have started while the face files were read; it rolls back
  // its assembly by key, so no edit runs while it is in flight.
  await waitForImports(openPantin);
  // From here on, no await: the document and the positions stay those on screen.
  const { document, jointPositions: positions } = openPantin;
  const placement = alignedPlacement(document, key, request, picks, faceFiles, positions);
  openPantin.document = parseWithSchema(
    PantinDocumentSchema,
    setAssemblyPlacement(document, key, placement),
    "The aligned Pantin",
  );
  const stored = openPantin.document.assemblies.find((assembly) => assembly.key === key);
  const anchor = anchorOfAssembly(openPantin.document, key);
  return {
    placement: stored?.placement ?? placement,
    anchor: anchor === undefined ? { kind: "world" } : { kind: "assembly", key: anchor },
    targetDisplaced: isTargetDisplaced(document, picks, positions),
  };
}
