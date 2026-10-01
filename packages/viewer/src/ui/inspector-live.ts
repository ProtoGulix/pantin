import type { DriveRuntime } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { liveText } from "../inspector/live-text.ts";
import { type DiagnosticLine, nextDiagnosticUpdate } from "../panel/drive-diagnostics.ts";
import type { LiveSource } from "../properties/property-rows.ts";
import { element } from "./dom.ts";

// Writes the latest tag read into the inspector's live cells, in place: the
// panel is redrawn on changes only, and typing in it must never be disturbed.

function warningLine(line: DiagnosticLine): HTMLElement {
  return element("p", { className: "inspector__warning", attributes: { title: line.id } }, [
    // The glyph is a second cue next to the colour; the text says it all for screen readers.
    element("span", { text: "⚠", attributes: { "aria-hidden": "true" } }),
    element("span", { text: line.text }),
  ]);
}

// The tag read runs four times a second: an unchanged warning is not redrawn,
// or screen readers would announce it again and the tooltip would vanish.
function showDiagnostics(
  target: Element,
  source: Extract<LiveSource, { kind: "diagnostics" }>,
  runtime: ReadonlyMap<string, DriveRuntime>,
  t: Translate,
): void {
  const update = nextDiagnosticUpdate(
    target.getAttribute("data-shown") ?? "",
    runtime.get(source.driveId)?.diagnostics ?? [],
    source.driveType,
    t,
  );
  if (update !== null) {
    target.setAttribute("data-shown", update.signature);
    target.replaceChildren(...update.lines.map(warningLine));
  }
}

function showText(
  target: Element,
  source: LiveSource,
  text: string,
  tags: ReadonlyMap<string, number>,
) {
  target.textContent = text;
  if (target instanceof HTMLButtonElement && source.kind === "tag") {
    target.setAttribute("aria-pressed", String((tags.get(source.tag) ?? 0) >= 0.5));
  }
}

export function showInspectorLive(
  root: HTMLElement,
  sources: ReadonlyMap<string, LiveSource>,
  tags: ReadonlyMap<string, number>,
  runtime: ReadonlyMap<string, DriveRuntime>,
  t: Translate,
): void {
  for (const target of root.querySelectorAll("[data-live-id]")) {
    const source = sources.get(target.getAttribute("data-live-id") ?? "");
    if (source === undefined) {
      continue;
    }
    if (source.kind === "diagnostics") {
      showDiagnostics(target, source, runtime, t);
      continue;
    }
    const text = liveText(source, tags, runtime, t);
    if (text !== null) {
      showText(target, source, text, tags);
    }
  }
}
