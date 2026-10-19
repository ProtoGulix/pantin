import type { StatusTone } from "../bridge/module-connection.ts";
import { glyphOfTone } from "../theme/state-glyphs.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";

/** A 12 px glyph tinted by its tone: decoration only, the status is always written next to it. */
export function statusDot(tone: StatusTone): HTMLElement {
  return element(
    "span",
    { className: `status-dot is-${tone}`, attributes: { "aria-hidden": "true" } },
    [icon(glyphOfTone(tone), "icon icon--small")],
  );
}
