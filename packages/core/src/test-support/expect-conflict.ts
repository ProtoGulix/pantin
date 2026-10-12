import { expect } from "vitest";
import { ApiError } from "../errors.ts";

/** Runs `action`, which must throw a `conflict` ApiError whose message holds every fragment. */
export function expectConflict(action: () => unknown, ...fragments: string[]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("conflict");
    for (const fragment of fragments) {
      expect((error as ApiError).message).toContain(fragment);
    }
    return;
  }
  throw new Error("Expected a conflict.");
}
