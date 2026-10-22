// Text that comes from a PLC (a certificate subject, a URI) ends up in a status line, which
// has a size limit, and in logs. It is cut at a fixed length so that no server can make a
// line grow without bound.

/** The longest PLC-provided text kept, in characters (code points), the marker included. */
export const MAX_PLC_TEXT_CHARACTERS = 256;

const CUT_MARKER = "…";

/** `text` itself when short enough, else its first characters followed by "…". */
export function boundedPlcText(text: string): string {
  // Spreading iterates code points, so a cut never splits a surrogate pair.
  const characters = [...text];
  if (characters.length <= MAX_PLC_TEXT_CHARACTERS) {
    return text;
  }
  return characters.slice(0, MAX_PLC_TEXT_CHARACTERS - CUT_MARKER.length).join("") + CUT_MARKER;
}
