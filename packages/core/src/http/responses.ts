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

/** A text answer, offered for download under `fileName` when one is given. */
export function sendText(
  response: ServerResponse,
  text: string,
  fileName?: string,
  mediaType = "text/plain",
): void {
  response.writeHead(200, {
    "content-type": `${mediaType}; charset=utf-8`,
    "content-length": Buffer.byteLength(text),
    ...(fileName === undefined
      ? {}
      : { "content-disposition": `attachment; filename="${fileName}"` }),
  });
  response.end(text);
}

/** A generated text file, offered for download under `fileName`. */
export function sendTextDownload(
  response: ServerResponse,
  text: string,
  fileName: string,
  mediaType = "text/plain",
): void {
  sendText(response, text, fileName, mediaType);
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
