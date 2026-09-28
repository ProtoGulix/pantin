import type { ServerResponse } from "node:http";
import type { ApiErrorResponse } from "@pantin/protocol";
import type { ApiError } from "../errors.ts";

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function sendApiError(response: ServerResponse, error: ApiError): void {
  if (response.headersSent) {
    response.destroy(error);
    return;
  }
  // After a rejected upload the rest of the body is unread: close the
  // connection instead of reading it.
  if (error.code === "payload_too_large") {
    response.setHeader("connection", "close");
  }
  const body: ApiErrorResponse = { error: { code: error.code, message: error.message } };
  sendJson(response, error.httpStatus, body);
}
