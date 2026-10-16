import type { TagType } from "@pantin/protocol";

// ADR 0045 point 5, ending the ADR 0012 point 2 tolerance: a bit tag holds 0
// or 1 and an integer tag a whole number, whoever writes and by whichever
// route. Returns the actionable problem, or null when the value fits.
export function tagValueProblem(name: string, type: TagType, value: number): string | null {
  if (type === "bit" && value !== 0 && value !== 1) {
    return `Tag "${name}" is a bit: write 0 or 1.`;
  }
  if (type === "integer" && !Number.isInteger(value)) {
    return `Tag "${name}" is an integer: write a whole number.`;
  }
  return null;
}
