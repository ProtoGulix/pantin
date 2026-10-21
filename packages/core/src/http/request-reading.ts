import type { IncomingMessage } from "node:http";
import { SYMBOL_FILE_MAX_BYTES } from "@pantin/protocol";
import { ApiError } from "../errors.ts";

const MAX_JSON_BODY_BYTES = 64 * 1024;

function tooLarge(maxBytes: number): ApiError {
  return new ApiError(
    "payload_too_large",
    `The request body exceeds ${maxBytes} bytes. Send a smaller file.`,
  );
}

// Reads the whole body but stops as soon as it goes over `maxBytes`, so an
// oversized upload is never buffered in full.
export async function readBodyBytes(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers["content-length"] ?? Number.NaN);
  if (declaredLength > maxBytes) {
    throw tooLarge(maxBytes);
  }
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    // Node yields Buffers for a request without a set encoding.
    const buffer = chunk as Buffer;
    receivedBytes += buffer.byteLength;
    if (receivedBytes > maxBytes) {
      throw tooLarge(maxBytes);
    }
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function requireContentType(request: IncomingMessage, ...acceptedTypes: string[]): void {
  const contentType = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType === undefined || !acceptedTypes.includes(contentType)) {
    throw new ApiError(
      "invalid_request",
      `Expected Content-Type ${acceptedTypes.join(" or ")}, got "${contentType ?? ""}".`,
      415,
    );
  }
}

/** The JSON body of a request; `maxBytes` is 64 KiB unless a route asks for a larger batch. */
export async function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  requireContentType(request, "application/json");
  const bytes = await readBodyBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("invalid_request", "The request body is not valid JSON.");
  }
}

/**
 * The text of an XML body, at most SYMBOL_FILE_MAX_BYTES (ADR 0064 point 13). A body that is
 * not valid UTF-8 is refused here; a byte order mark is dropped by the decoder.
 */
export async function readXmlBody(request: IncomingMessage): Promise<string> {
  requireContentType(request, "application/xml", "text/xml");
  const bytes = await readBodyBytes(request, SYMBOL_FILE_MAX_BYTES);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError(
      "invalid_request",
      "The request body is not valid UTF-8: save the symbol file as UTF-8.",
    );
  }
}
