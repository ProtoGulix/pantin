import { DEFAULT_SNAP_STEPS, type SnapSteps } from "./placement-snapping.ts";

// The steps of the gizmo are a setting of the viewer, kept in the browser and
// never in the Pantin (ADR 0034 point 5). Stored as "mm;degrees".

function positiveNumber(text: string | undefined): number | null {
  const value = Number(text);
  return text !== undefined && text.trim() !== "" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function serializeSteps(steps: SnapSteps): string {
  return `${steps.translationMillimetres};${steps.rotationDegrees}`;
}

/** A stored value that is missing or unreadable gives the defaults. */
export function parseStoredSteps(stored: string | null): SnapSteps {
  const [translation, rotation] = (stored ?? "").split(";");
  return {
    translationMillimetres:
      positiveNumber(translation) ?? DEFAULT_SNAP_STEPS.translationMillimetres,
    rotationDegrees: positiveNumber(rotation) ?? DEFAULT_SNAP_STEPS.rotationDegrees,
  };
}

/** The steps with one value typed in a field; an invalid text leaves them as they are. */
export function withTypedStep(steps: SnapSteps, field: keyof SnapSteps, text: string): SnapSteps {
  const typed = positiveNumber(text.replace(",", "."));
  return typed === null ? steps : { ...steps, [field]: typed };
}
