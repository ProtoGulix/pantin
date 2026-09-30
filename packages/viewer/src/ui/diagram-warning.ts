import type { DriveDiagnostic } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import type { DiagnosticLine } from "../panel/drive-diagnostics.ts";
import type { DrawnNode } from "./diagram-node-draw.ts";
import { svgElement } from "./svg-dom.ts";

// A drive with a diagnostic (ADR 0029 point 8) is outlined and names it under
// its box. The short name fits the box; the tooltip and the accessible name
// carry B1's full wording (panel/drive-diagnostics.ts).

// Typed on the diagnostic union: a new diagnostic must get its short name here.
const SHORT_NAMES = {
  conflicting_commands: "diagram.diagnostic.conflicting_commands",
} as const satisfies Record<DriveDiagnostic, MessageKey>;

export function showNodeWarning(
  node: DrawnNode,
  lines: readonly DiagnosticLine[],
  t: Translate,
): void {
  node.warning?.remove();
  node.warning = null;
  node.group.classList.toggle("has-warning", lines.length > 0);
  if (lines.length === 0) {
    node.group.setAttribute("aria-label", node.baseLabel);
    node.title.textContent = node.baseLabel;
    return;
  }
  const full = t("diagram.nodeWarning", {
    node: node.baseLabel,
    warning: lines.map((line) => line.text).join(" "),
  });
  node.group.setAttribute("aria-label", full);
  node.title.textContent = full;
  const shortText = lines.map((line) => t(SHORT_NAMES[line.id])).join(", ");
  // The glyph is a second cue next to the colour, as on the drive card.
  node.warning = svgElement(
    "text",
    {
      class: "diagram-node__warning",
      x: node.warningAnchor.x,
      y: node.warningAnchor.y,
      "aria-hidden": "true",
    },
    [`⚠ ${shortText}`],
  );
  node.group.append(node.warning);
}
