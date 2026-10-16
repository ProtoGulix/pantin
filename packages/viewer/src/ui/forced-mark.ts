import type { Translate } from "../i18n/translate.ts";
import type { PropertyRow } from "../properties/property-rows.ts";
import { rowTagName } from "../properties/row-tag.ts";
import { element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The "forced" mark of an inspector row (ADR 0045 point 5): a badge whose text
// says it (colour is never the only cue) and a button that releases the tag.
// Built hidden with the row and shown in place by showForcedMarks, so that the
// live pass never redraws a row, and keeps the focus of the control next to it.

const FORCED_TAG_ATTRIBUTE = "data-forced-tag";

const RELEASE_KEY_PREFIX = "release-";

interface FocusableLike {
  focus(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

/** What the focus fallback needs of a table row; a real row has it. */
export interface RowLike {
  querySelectorAll(selector: string): Iterable<FocusableLike>;
  querySelector(selector: string): FocusableLike | null;
}

/**
 * Moves the focus off a release button that is about to hide: to the row's own
 * control, else to the row's header (made focusable for the purpose), so that
 * the keyboard user keeps their place instead of falling back to the page.
 */
export function focusBesideRelease(row: RowLike | null): void {
  if (row === null) {
    return;
  }
  const controls = [...row.querySelectorAll("[data-focus-key]")];
  const control = controls.find(
    (candidate) => !candidate.getAttribute("data-focus-key")?.startsWith(RELEASE_KEY_PREFIX),
  );
  if (control !== undefined) {
    control.focus();
    return;
  }
  // Only the header is made focusable: a control keeps its place in the Tab order.
  const header = row.querySelector("th");
  header?.setAttribute("tabindex", "-1");
  header?.focus();
}

function releaseButton(tag: string, t: Translate, intents: Pick<PanelIntents, "releaseTag">) {
  const label = t("forced.releaseTag", { tag });
  const created = iconButton("unlock", label, () => {
    focusBesideRelease(created.closest("tr"));
    intents.releaseTag(tag);
  });
  created.setAttribute("data-focus-key", `${RELEASE_KEY_PREFIX}${tag}`);
  created.title = t("forced.releaseTitle", { tag });
  return created;
}

/** The mark of a row that shows a tag, hidden until the tag is read as forced; null for other rows. */
export function forcedMark(
  row: PropertyRow,
  t: Translate,
  intents: Pick<PanelIntents, "releaseTag">,
): HTMLElement | null {
  const tag = rowTagName(row);
  if (tag === null) {
    return null;
  }
  const badge = element("span", { className: "forced-mark__badge" }, [
    icon("lock"),
    element("span", { text: t("forced.badge") }),
  ]);
  badge.title = t("forced.badgeHint");
  const mark = element(
    "span",
    { className: "forced-mark", attributes: { [FORCED_TAG_ATTRIBUTE]: tag } },
    [badge, releaseButton(tag, t, intents)],
  );
  mark.hidden = true;
  return mark;
}

interface MarkLike {
  hidden: boolean;
  getAttribute(name: string): string | null;
}

/** Shows the marks of the forced tags and hides the others, writing only what changed. */
export function showForcedMarks(
  root: { querySelectorAll(selector: string): Iterable<MarkLike> },
  forced: ReadonlySet<string>,
): void {
  for (const mark of root.querySelectorAll(`[${FORCED_TAG_ATTRIBUTE}]`)) {
    const shown = forced.has(mark.getAttribute(FORCED_TAG_ATTRIBUTE) ?? "");
    if (mark.hidden === shown) {
      mark.hidden = !shown;
    }
  }
}
