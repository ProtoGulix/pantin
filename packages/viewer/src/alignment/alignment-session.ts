import {
  ALIGNMENT_KINDS,
  type AlignmentKind,
  type AlignmentPick,
  type AlignmentSide,
  type AlignRequest,
  AlignRequestSchema,
} from "@pantin/protocol";
import { parseNumber } from "../joints/joint-form.ts";

// The alignment under way in the viewer (ADR 0035 points 3 and 5): which
// assembly moves, the kind, the picks made so far and the typed parameters.
// Display state only, never saved; the core computes and stores the result.

/** The triangles to tint for a pick: a whole face, or the triangle of a fallback pick. */
export interface FaceHighlight {
  bodyId: string;
  // Index of the picked Babylon mesh among the body's meshes.
  meshIndex: number;
  firstTriangle: number;
  triangleCount: number;
  side: AlignmentSide;
}

export interface AlignmentPickState {
  pick: AlignmentPick;
  highlight: FaceHighlight;
  // A face of the face file, or the plane of the picked triangle.
  faceKind: "plane" | "cylinder" | "fallback";
}

export interface AlignmentSession {
  pantinId: string;
  assemblyKey: string;
  kind: AlignmentKind;
  // One entry per pick of the kind's descriptor, null until picked.
  picks: readonly (AlignmentPickState | null)[];
  // A done pick the user chose to replace: the next click fills it, the other
  // picks are kept (ADR 0039 point 4). Null: the first pick still missing.
  currentPick: number | null;
  flip: boolean;
  // As typed: millimetres and degrees (CLAUDE.md section 5).
  offsetText: string;
  rotationText: string;
  fixedJoint: boolean;
}

function emptyPicks(kind: AlignmentKind): null[] {
  return ALIGNMENT_KINDS[kind].picks.map(() => null);
}

export function newAlignmentSession(pantinId: string, assemblyKey: string): AlignmentSession {
  const kind: AlignmentKind = "plane_on_plane";
  return {
    pantinId,
    assemblyKey,
    kind,
    picks: emptyPicks(kind),
    currentPick: null,
    flip: false,
    offsetText: "0",
    rotationText: "0",
    fixedJoint: false,
  };
}

/** Another kind starts its picks over; the parameters stay as typed. */
export function withKind(session: AlignmentSession, kind: AlignmentKind): AlignmentSession {
  return { ...session, kind, picks: emptyPicks(kind), currentPick: null };
}

export function withoutPicks(session: AlignmentSession): AlignmentSession {
  return { ...session, picks: emptyPicks(session.kind), currentPick: null };
}

/** The pick the next click fills, or null when every pick is made. */
export function nextPickIndex(session: AlignmentSession): number | null {
  if (session.currentPick !== null) {
    return session.currentPick;
  }
  const index = session.picks.indexOf(null);
  return index === -1 ? null : index;
}

/**
 * Makes pick `index` the one the next click fills; the others stay. Choosing
 * the pick already being replaced cancels it: the old pick is kept.
 */
export function withCurrentPick(session: AlignmentSession, index: number): AlignmentSession {
  if (index < 0 || index >= session.picks.length) {
    return session;
  }
  return { ...session, currentPick: session.currentPick === index ? null : index };
}

/** The pick fills its place; the next click follows the first pick still missing. */
export function withPick(
  session: AlignmentSession,
  index: number,
  pick: AlignmentPickState,
): AlignmentSession {
  return {
    ...session,
    picks: session.picks.map((current, at) => (at === index ? pick : current)),
    currentPick: null,
  };
}

export type AlignRequestOutcome =
  | { ok: true; request: AlignRequest }
  | { ok: false; reason: "missingPicks" | "invalidOffset" | "invalidRotation" | "invalid" };

/** The request for the core, in SI units (ADR 0035 point 10). */
export function alignRequestOf(session: AlignmentSession): AlignRequestOutcome {
  const picks = session.picks.flatMap((state) => (state === null ? [] : [state.pick]));
  if (picks.length !== session.picks.length) {
    return { ok: false, reason: "missingPicks" };
  }
  const parameters = ALIGNMENT_KINDS[session.kind].parameters;
  const offset = parseNumber(session.offsetText);
  const rotation = parseNumber(session.rotationText);
  if (parameters.includes("offset") && !Number.isFinite(offset)) {
    return { ok: false, reason: "invalidOffset" };
  }
  if (parameters.includes("rotation") && !Number.isFinite(rotation)) {
    return { ok: false, reason: "invalidRotation" };
  }
  const parsed = AlignRequestSchema.safeParse({
    kind: session.kind,
    picks,
    // Only the parameters the kind has: the core refuses the others.
    flip: parameters.includes("flip") ? session.flip : undefined,
    offset: parameters.includes("offset") ? offset / 1000 : undefined,
    rotation: parameters.includes("rotation") ? (rotation * Math.PI) / 180 : undefined,
  });
  return parsed.success ? { ok: true, request: parsed.data } : { ok: false, reason: "invalid" };
}
