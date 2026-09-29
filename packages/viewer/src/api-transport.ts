import { API_PREFIX, type ApiErrorCode, ApiErrorResponseSchema } from "@pantin/protocol";

// HTTP plumbing shared by every route family of the API client: typed
// errors, response validation, URLs. Nothing here knows a specific route.

export type ApiFailureKind =
  // The core answered with a well-formed ApiErrorResponse.
  | "api"
  // The core could not be reached at all.
  | "network"
  // The core answered something that does not match the contract.
  | "invalid_response"
  // The viewer refused to send a request that breaks the contract.
  | "invalid_input";

export class PantinApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly code: ApiErrorCode | null;
  readonly status: number | null;

  constructor(
    kind: ApiFailureKind,
    message: string,
    code: ApiErrorCode | null,
    status: number | null,
  ) {
    super(message);
    this.name = "PantinApiError";
    this.kind = kind;
    this.code = code;
    this.status = status;
  }
}

// Structural view of a Zod schema, so the viewer depends on the contract
// package only and not on zod itself.
type SafeParseResult<Output> =
  | { success: true; data: Output }
  | { success: false; error: { message: string; issues: readonly { message: string }[] } };
export interface Schema<Output> {
  safeParse(input: unknown): SafeParseResult<Output>;
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export function pantinUrl(pantinId: string, suffix = ""): string {
  return `${API_PREFIX}/pantins/${encodeURIComponent(pantinId)}${suffix}`;
}

export function validInputOrThrow<Output>(schema: Schema<Output>, input: unknown): Output {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(" ");
    throw new PantinApiError("invalid_input", message, "invalid_request", null);
  }
  return result.data;
}

export async function sendRequest(
  fetchFunction: FetchFunction,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchFunction(url, init);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new PantinApiError(
      "network",
      `Cannot reach the Pantin core (${reason}). Is it running on 127.0.0.1:4800?`,
      null,
      null,
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // The body is unusable either way; the caller reports it as a contract break.
    return undefined;
  }
}

export async function failureFromResponse(response: Response): Promise<PantinApiError> {
  const parsed = ApiErrorResponseSchema.safeParse(await readJson(response));
  if (parsed.success) {
    const { code, message } = parsed.data.error;
    return new PantinApiError("api", message, code, response.status);
  }
  return new PantinApiError(
    "invalid_response",
    `The core answered HTTP ${response.status} without a valid error description.`,
    null,
    response.status,
  );
}

export async function requestJson<Output>(
  fetchFunction: FetchFunction,
  url: string,
  init: RequestInit,
  schema: Schema<Output>,
): Promise<Output> {
  const response = await sendRequest(fetchFunction, url, init);
  if (!response.ok) {
    throw await failureFromResponse(response);
  }
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new PantinApiError(
      "invalid_response",
      `The core's answer to ${init.method ?? "GET"} ${url} does not match the protocol: ${parsed.error.message}`,
      null,
      response.status,
    );
  }
  return parsed.data;
}

export function jsonRequest(method: string, body?: unknown): RequestInit {
  if (body === undefined) {
    return { method };
  }
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export type SendJson = <Output>(
  url: string,
  init: RequestInit,
  schema: Schema<Output>,
) => Promise<Output>;
