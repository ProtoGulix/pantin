import type { BridgeView } from "../bridge/bridge-view.ts";
import { element } from "./dom.ts";
import { glyphThenText } from "./state-glyph.ts";

// The failure block of the bridge panel: a headline led by the glyph of its severity,
// the message, and the log of the bridge process folded away.

export function bridgeFailureBlock(
  view: BridgeView,
  onToggle: (open: boolean) => void,
  logOpen: boolean,
) {
  const { failure } = view;
  if (failure === null) {
    return null;
  }
  const log = element("details", { className: "bridge-panel__log" }, [
    element("summary", { text: failure.logTitle }),
    element("pre", { text: failure.log.join("\n") }),
  ]);
  log.open = logOpen;
  log.addEventListener("toggle", () => onToggle(log.open));
  return element(
    "div",
    {
      className: `bridge-panel__failure${failure.warning ? " is-warning" : ""}`,
      attributes: { role: "alert" },
    },
    [
      element(
        "strong",
        { className: "bridge-panel__headline" },
        glyphThenText(failure.warning ? "warning" : "error", failure.headline),
      ),
      element("p", { className: "bridge-panel__message", text: failure.message }),
      failure.log.length === 0 ? null : log,
    ],
  );
}
