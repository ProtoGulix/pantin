import { ApiError } from "../errors.ts";

// Splits a raw request target into decoded path segments and query. The raw
// path is split before decoding, so "%2F" or "%2E%2E" stay inside a single
// segment and are then rejected by the id schemas instead of being resolved.
export function parseRequestTarget(rawTarget: string): {
  segments: string[];
  query: URLSearchParams;
} {
  const queryIndex = rawTarget.indexOf("?");
  const rawPath = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : rawTarget.slice(queryIndex + 1);
  const rawSegments = rawPath.split("/").filter((segment) => segment !== "");
  try {
    return {
      segments: rawSegments.map((segment) => decodeURIComponent(segment)),
      query: new URLSearchParams(rawQuery),
    };
  } catch {
    throw new ApiError("invalid_request", `The URL path "${rawPath}" is not correctly encoded.`);
  }
}

// Matches segments against a pattern such as ["pantins", ":pantinId"].
// Returns the captured parameters, or undefined when the pattern does not fit.
export function matchPattern(
  pattern: readonly string[],
  segments: readonly string[],
): Record<string, string> | undefined {
  if (pattern.length !== segments.length) {
    return undefined;
  }
  const parameters: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const segment = segments[index] ?? "";
    if (part.startsWith(":")) {
      parameters[part.slice(1)] = segment;
    } else if (part !== segment) {
      return undefined;
    }
  }
  return parameters;
}
