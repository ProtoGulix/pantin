const STEP_MAGIC = "ISO-10303-21;";
// Enough for a byte order mark, leading whitespace and the magic line.
const STEP_SNIFF_BYTES = 1024;

// ISO 10303-21 (STEP physical file): the first token is "ISO-10303-21;",
// possibly after a UTF-8 byte order mark and whitespace.
export function isStepFile(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { ignoreBOM: false }).decode(
    bytes.subarray(0, STEP_SNIFF_BYTES),
  );
  return text.trimStart().startsWith(STEP_MAGIC);
}
