import type { IconName } from "./icons.ts";
import { icon } from "./icons.ts";

// ADR 0057 rule 4: the 12 px glyph put in front of a text that a state colour tints,
// so that the colour is never the only cue. The text next to it says the same.

/** The glyph of a state, drawn small and silent (the text beside it is the accessible name). */
function stateGlyph(name: IconName): SVGSVGElement {
  return icon(name, "icon icon--small state-glyph");
}

/** The children of a line that begins with the glyph of its state. */
export function glyphThenText(name: IconName, text: string): Node[] {
  return [stateGlyph(name), document.createTextNode(text)];
}
