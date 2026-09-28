import type { IncomingMessage } from "node:http";
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

export function requireContentType(request: IncomingMessage, expectedType: string): void {
  const contentType = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== expectedType) {
    throw new ApiError(
      "invalid_request",
      `Expected Content-Type ${expectedType}, got "${contentType ?? ""}".`,
      415,
    );
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  requireContentType(request, "application/json");
  const bytes = await readBodyBytes(request, MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("invalid_request", "The request body is not valid JSON.");
  }
}
