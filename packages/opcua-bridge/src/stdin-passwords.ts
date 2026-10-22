import { BridgeStdinLineSchema } from "@pantin/protocol";
import { ConfigurationError } from "./errors.ts";

// The passwords of the `user` modules arrive on stdin, as one JSON line then EOF, only under
// --status-lines, that is, only when the core started the bridge (ADR 0065 point 5). A
// password is never put in a message: errors here say what is wrong with the line, not what
// it holds.

// 32 modules of 256 characters, escaped, stay far below this.
const MAX_LINE_BYTES = 256 * 1024;

export type PasswordInput = AsyncIterable<string | Uint8Array>;

async function readToEnd(input: PasswordInput): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_LINE_BYTES) {
      throw new ConfigurationError("The password line on stdin is larger than 256 KiB.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseLine(text: string): ReadonlyMap<string, string> {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new ConfigurationError(
      'The line on stdin is not JSON. Expected {"passwords": {"<module>": "<password>"}}.',
    );
  }
  const parsed = BridgeStdinLineSchema.safeParse(document);
  if (!parsed.success) {
    // The Zod message names paths and expected types, never the offending values.
    throw new ConfigurationError(
      `The line on stdin does not match {"passwords": {...}}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return new Map(Object.entries(parsed.data.passwords));
}

/**
 * Reads stdin to EOF under --status-lines; reads nothing otherwise, so that a manual run in
 * a terminal never waits for input. Module key to password.
 */
export async function readPasswords(
  input: PasswordInput,
  statusLines: boolean,
): Promise<ReadonlyMap<string, string>> {
  if (!statusLines) {
    return new Map();
  }
  return parseLine(await readToEnd(input));
}
