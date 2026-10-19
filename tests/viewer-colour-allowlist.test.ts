import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reservedUsesOf, UnsupportedCssError } from "./css-colour-uses.ts";

// ADR 0057 rule 1, rule 3 and rule 5: a state colour, an IEC fill or the brand colour is
// never the only cue. Every CSS rule that uses one is declared below with the second cue
// that tells the same thing without colour; a new use fails until it is declared here.

const STYLES = new URL("../packages/viewer/src/styles/", import.meta.url);

const ALLOWLIST: Readonly<Record<string, string>> = {
  "about.css :: .about__mismatch":
    "warning glyph in front of the sentence, which names both versions, and a 1 px outline",
  "about.css :: .about__name": "brand: Pantin's own name, written out in the text",
  "about.css :: .about__symbol": "brand: Pantin's own symbol, beside its name in text",
  "base.css :: .button--primary":
    "brand: Pantin's own primary action, with its text label (rule 5)",
  "bridge-panel.css :: .bridge-panel__error": "error glyph in front of the sentence (rule 4)",
  "bridge-panel.css :: .bridge-panel__failure":
    "error or warning glyph in the headline, 3 px left bar",
  "bridge-panel.css :: .bridge-panel__failure.is-warning":
    "warning glyph in the headline, 3 px left bar",
  "bridge-panel.css :: .status-dot.is-error":
    "error glyph (octagon cross) and the status word beside it",
  "bridge-panel.css :: .status-dot.is-ok": "check glyph and the status word beside it",
  "console.css :: .console-counter__count--errors.is-active":
    "error glyph before the count and the count itself",
  "console.css :: .console-counter__count--warnings.is-active":
    "warning glyph before the count and the count itself",
  "console.css :: .console-line--error": "error glyph, level word and 3 px left bar",
  "console.css :: .console-line--error .console-line__level": "error glyph and level word",
  "console.css :: .console-line--warning": "warning glyph, level word and 3 px left bar",
  "console.css :: .console-line--warning .console-line__level": "warning glyph and level word",
  "diagram-wiring.css :: .diagram-port.is-lit .diagram-socket":
    "thicker ring on the lit socket, beside the thicker lit edge (width)",
  "diagram-wiring.css :: .diagram-value-input .text-input.is-invalid":
    "dashed border, and the field title names the refusal",
  "diagram.css :: .diagram-forced": "the F mark itself",
  "diagram.css :: .diagram-node.has-warning .diagram-node__box":
    "dashed thicker outline and the warning glyph and short name under the box",
  "diagram.css :: .diagram-node__warning": "warning glyph in front of the short diagnostic name",
  "diagram.css :: .diagram-port.is-forced .diagram-socket": "F mark beside the socket",
  "inspector.css :: .inspector__warning": "warning glyph in front of the text and 3 px left bar",
  "io.css :: .io-module__problems": "error glyph in front of the problem count",
  "io.css :: .io-problems": "error glyph in the title and the problem list text",
  "io.css :: .is-problem": "dashed outline and aria-invalid",
  "journal.css :: .journal__badge--level-error": "error glyph and level word in the badge, outline",
  "journal.css :: .journal__badge--level-warning":
    "warning glyph and level word in the badge, outline",
  "journal.css :: .journal__entry--error": "error badge (glyph and word) and 3 px left bar",
  "journal.css :: .journal__entry--warning": "warning badge (glyph and word) and 3 px left bar",
  "journal.css :: .journal__error": "error glyph in front of the sentence",
  "message-line.css :: .message-line--error": "error icon and visually hidden level word",
  "message-line.css :: .message-line--error .message-line__level":
    "error icon and visually hidden level word",
  "properties.css :: .forced-mark__badge": "lock glyph and the word Forced",
  "properties.css :: .property-grid__error": "error glyph in front of the sentence",
  "properties.css :: .property-grid__value--editable .text-input.is-invalid":
    "dashed border, and the error line under the group",
  "zones.css :: .zone-bar__button.is-pressed":
    "brand: the active view of a zone, its name in words, aria-pressed and a 2 px bottom bar",
  "switch-diagram.css :: .switch-diagram__hold":
    "dashed outline against the solid outline of the on zone, and the dimensions in text",
  "switch-diagram.css :: .switch-diagram__on":
    "solid thick outline, higher opacity than the hold zone, and the dimensions in text",
  "switch-diagram.css :: .switch-diagram__problem": "error glyph in front of the sentence",
  "switch-diagram.css :: .switch-diagram__symbol--refused":
    "dashed stroke and the problem sentence under the diagram",
  "switch-diagram.css :: .switch-diagram__zone-arrow":
    "arrow head shape that opens the zone, beside the zone outline",
  "transport.css :: .transport__warning": "warning icon and the text",
  "tree.css :: .tree-row__state--on": "filled disc against the ring of off",
  "welcome.css :: .welcome-tile__icon": "brand: Pantin's own start tile, with its text label",
  'welcome.css :: .welcome__tab[aria-selected="true"]':
    "brand: the active tab, aria-selected and bolder text colour",
};

function reservedKeysInStyles(): string[] {
  return readdirSync(STYLES)
    .filter((name) => name.endsWith(".css"))
    .flatMap((name) => reservedUsesOf(name, readFileSync(new URL(name, STYLES), "utf8")))
    .map((use) => use.key)
    .sort();
}

describe("the reserved colours of the stylesheets", () => {
  const used = reservedKeysInStyles();

  it("are all declared with their second cue", () => {
    const undeclared = used.filter((key) => !(key in ALLOWLIST));
    expect(undeclared, "declare each new use with its second cue").toEqual([]);
  });

  it("are all still used (no stale entry)", () => {
    const stale = Object.keys(ALLOWLIST).filter((key) => !used.includes(key));
    expect(stale).toEqual([]);
  });

  it("name a second cue each", () => {
    for (const [key, cue] of Object.entries(ALLOWLIST)) {
      expect(cue.trim().length, key).toBeGreaterThan(10);
    }
  });

  it("find rules in at-rules and ignore the tints of the reserved tokens", () => {
    const css =
      "@media (x) { .a { color: var(--state-normal); } } :root { --brand-soft: var(--brand); }";
    expect(reservedUsesOf("t.css", css).map((use) => use.key)).toEqual(["t.css :: .a"]);
  });

  it("is not fooled by a brace inside a string", () => {
    const css = '.a::before { content: "}"; } .b { color: var(--brand); }';
    expect(reservedUsesOf("t.css", css).map((use) => use.key)).toEqual(["t.css :: .b"]);
  });

  it("refuses what it cannot follow, instead of missing a use", () => {
    const refused = (css: string) => () => reservedUsesOf("t.css", css);
    expect(refused(":root { --on: var(--state-normal); }")).toThrow(UnsupportedCssError);
    expect(refused('@import "x.css"; .a { color: red; }')).toThrow(UnsupportedCssError);
    expect(refused("@keyframes k { from { color: var(--brand); } }")).toThrow(UnsupportedCssError);
    expect(refused(".a { & .b { color: var(--brand); } }")).toThrow(UnsupportedCssError);
  });
});
