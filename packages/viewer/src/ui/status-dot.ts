import type { StatusTone } from "../bridge/module-connection.ts";
import { element } from "./dom.ts";

/** A coloured dot: decoration only, the status is always written next to it. */
export function statusDot(tone: StatusTone): HTMLElement {
  return element("span", {
    className: `status-dot is-${tone}`,
    attributes: { "aria-hidden": "true" },
  });
}
