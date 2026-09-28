import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { ApiError } from "../errors.ts";

export function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isSameOrInside(base: string, target: string): boolean {
  return target === base || target.startsWith(`${base}${sep}`);
}

// Lexical check: the resolved path must stay inside the base directory.
export function resolveInside(baseDirectory: string, ...segments: string[]): string {
  const base = resolve(baseDirectory);
  const target = resolve(base, ...segments);
  if (!isSameOrInside(base, target)) {
    throw new ApiError("invalid_request", "The requested path leaves the served directory.");
  }
  return target;
}

// Physical check: after following symbolic links, `path` must still be inside
// the base directory. Rejects with ENOENT when `path` does not exist.
export async function assertRealPathInside(baseDirectory: string, path: string): Promise<void> {
  const [realBase, realTarget] = await Promise.all([realpath(baseDirectory), realpath(path)]);
  if (!isSameOrInside(realBase, realTarget)) {
    throw new ApiError(
      "invalid_request",
      "A symbolic link leads outside the served directory. Replace it with a real file or folder.",
    );
  }
}
