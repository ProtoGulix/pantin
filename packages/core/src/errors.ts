import type { ApiErrorCode } from "@pantin/protocol";

const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  unsupported_file: 415,
  payload_too_large: 413,
  conversion_unavailable: 503,
  conversion_failed: 422,
  internal_error: 500,
};

// An error meant to reach the API client: its message must say what was wrong
// and how to fix it.
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;

  constructor(code: ApiErrorCode, message: string, httpStatus = HTTP_STATUS_BY_CODE[code]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
