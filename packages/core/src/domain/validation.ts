import type { ApiErrorCode } from "@pantin/protocol";
import { ApiError } from "../errors.ts";

type ValidationIssue = { readonly path: readonly PropertyKey[]; readonly message: string };

// The subset of a Zod schema this module relies on, so that it works with any
// schema: those of @pantin/protocol and the core's own converter output schema.
type Parser<Output> = {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: Output }
    | { success: false; error: { issues: readonly ValidationIssue[] } };
};

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.path.map((key) => String(key)).join(".");
      return location === "" ? issue.message : `${location}: ${issue.message}`;
    })
    .join("; ");
}

// Parses external data with a protocol schema; on failure throws an ApiError
// whose message starts with `context` (what was being read).
export function parseWithSchema<Output>(
  schema: Parser<Output>,
  value: unknown,
  context: string,
  code: ApiErrorCode = "invalid_request",
): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(code, `${context} is invalid: ${formatIssues(result.error.issues)}.`);
  }
  return result.data;
}
