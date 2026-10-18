# 0057. Colour-blind safe information coding (ISA-101 principles)

- Status: accepted (user, 2026-10-18)
- Date: 2026-10-18
- Amends: ADR 0053 (see the last section)

## Context

The project owner is colour blind. Two codings must never be told apart by
close hues (blue/violet, brown/green, red/orange), and the 3D view and the
menus must follow the principles of ISA-101 (user statements, 2026-10-18).
The identity of ADR 0053 (brand orange, logo, two themes, overall look) stays
as it is: only the coding of information changes.

What ISA-101 says (spike 0010): the text of ANSI/ISA-101.01-2015 was not read
(paywalled). Secondary sources agree on "grey by default, colour reserved for
abnormal conditions, colour never the only cue". NOT VERIFIED: any clause, any
shall/should split, any reserved colour list, and whether a 3D editing view is
in the standard's scope (inferred: no). Pantin therefore does not claim
ISA-101 conformance: it follows the doctrine in its own style guide, this
ADR. WCAG 2.2 SC 1.4.1 (colour not the only means) and SC 1.4.11 (3:1
non-text contrast) were read and are testable. The Machado 2009 matrices are
already in `tests/viewer-theme-contrast.test.ts`.

Audit of the viewer (2026-10-18; luminances by the WCAG formula, to be
confirmed by the tests; "cue" = an existing non-colour cue):

| Coding | Light | Dark | Cue | Problem |
| --- | --- | --- | --- | --- |
| State text abnormal / emergency / normal (`base.css`) | #7A5800 / #B3261E / #2A6E3F, luminance 0.11 / 0.11 / 0.12 | #E8B923 / #F48A82 / #5CB87A, 0.52 / 0.39 / 0.38 | words, mostly | same lightness; red/green and brown/green pairs |
| Journal level badges (fill) | state text tokens as fills | idem | level word | fills of equal lightness (light) |
| Status dot ok / busy / error (`status-dot.ts`) | green / blue / red disc | idem | word in the bridge panel; tooltip only in the I/O module list | same shape for every tone |
| Console counter pressed | brand-soft | idem | count | brand beside the error and warning counts |
| Toggle On (`inspector.css`) | brand border | idem | word On/Off | brand shows a bit state, beside the forced badge |
| Tree sensor on / off | state-normal disc / faint ring | idem | fill vs ring | green here, blue in 3D |
| Tree driven bolt, sensor icon | state-normal, sensor-mark | idem | icon shape | colour codes a property, not a state |
| Diagram link drop target, info message, alignment step done | state-normal | idem | stroke, icon | green is not a state there |
| Diagram edge energies (`diagram.css`) | pneumatic #5AA9E6, AC #F0A030, servo #B48EAD, mechanical #9AA3B2, observation #6CC38A | idem | dash and width | AC on the abnormal hue, observation on the normal hue |
| Joint arrow free / driven | #1D3F8C / #2A6E3F | #7FA8EC / #5CB87A (0.385 / 0.379) | words in the properties only | blue/green by hue alone |
| Face alignment moving / target | selection / #A371F7 | idem | none | blue/violet |
| Body selection in 3D | selection tint | idem | none (outline only on a joint's child) | tint alone |
| Sensor marker ON / OFF | #58A6FF / #6E7681 | idem | none (about 1.8:1) | below 3:1 |
| Light beam ON / OFF | #FF5A4D / #8A4A44, alpha 0.5 | idem | opacity | red = emergency hue |
| Conveyor emitter / absorber / guide | #3FB950 / #F0883E / #7D6FF0 | idem | none | green/orange of equal luminance; violet beside the selection |
| Axes X/Y/Z | three different sets (stage, trihedron, view cube) | idem | letters on trihedron and view cube only | three values for one meaning; red/green |

Arithmetic constraint: on surface-0 the 4.5:1 text rule caps a light theme
text token's luminance at about 0.128, and on surface-2 it floors a dark
theme text token at about 0.346. No two state text tokens can reach 3:1
between themselves: for text, a glyph or a word carries the meaning.

## Decision

1. **Colour is never the only cue.** Every coding has a glyph, a shape, fill
   versus outline, a line style or a word that tells it alone. A tooltip or an
   aria-label does not count.
2. **Pairs stay apart for colour blind users.** Every pair of codings shown
   together as fills, marks or in the 3D view has a simulated CIE76 ΔE of at
   least 40 for protanopia, deuteranopia and tritanopia (Machado 2009, full
   severity), a luminance ratio of at least 3:1 between the two, and at least
   3:1 against its ground (WCAG 1.4.11). The joint preview pair keeps its
   45. State text tokens are exempt from the pair ratio (arithmetic
   constraint) but never appear without their glyph.
   `tests/viewer-colour-pairs.test.ts` checks the registered pairs and shares
   the colour maths with `tests/viewer-theme-contrast.test.ts`.
3. **Colour is reserved for meaning, one meaning each, the same everywhere**
   (3D, tree, diagram, panels):
   - selection blue: selected, focus, the moving side, interface attention
     (unsaved, busy, link target);
   - state-normal green: a signal on, an output energised, a bridge running,
     and nothing else (IEC 60204-1 convention kept, user's choice);
   - state-abnormal amber: forced, warning;
   - state-emergency red: error, failure, injected fault, invalid value;
   - neutral text colours: every other property (driven, watched, done, info).

   Data colours (axes, energies, materials, joint parent) never take a hue of
   the state colours or of the brand.
4. **One glyph per state**, a 12 px icon next to every state colour: warning
   triangle (abnormal), cross in an octagon (emergency), check (normal, ok),
   ring (idle, off), half ring (busy). Forced keeps its "F" mark.
5. **Brand orange marks only Pantin itself**: primary buttons, the active tab
   or view mode. It never shows a state, a pressed filter or a toggle value,
   and never sits in the same row or toolbar group as a state glyph. Pressed
   filters and toggles take the selection role.
6. **Fills use IEC fill hues**, the same in both themes: `--fill-abnormal`
   #F2B10A with dark text, `--fill-emergency` #B3261E with white text,
   `--fill-normal` #2E7D46 with white text. Normal and emergency fills are
   about 1.3:1 apart: they are never shown without their glyph.
7. **Data colours live in one module**, `packages/viewer/src/theme/data-palette.ts`,
   with per-theme values where lightness requires it. No literal colour is
   left in `scene/`, `conveyors/` or `ui/view-cube.ts`.

Codings to change (identity untouched):

| Coding | New second cue | Colour change |
| --- | --- | --- |
| Status dot | glyph of point 4; status word visible in the I/O module list | none |
| Journal level badges | level word plus glyph | IEC fills of point 6 |
| Console counter pressed | pressed border | selection-soft instead of brand |
| Toggle On | word plus inset border | brand removed |
| Tree driven bolt, sensor icon | icon shape | neutral text-muted; `--sensor-mark` retired |
| Link drop target | thicker dashed stroke | selection |
| Info message, alignment step done | info icon; check glyph | neutral |
| Diagram edges | dash and width plus energy abbreviation on the label | per-theme tokens off the state and brand hues, 3:1 on the ground; Okabe-Ito candidates, NOT VERIFIED until the test passes |
| Joint arrow driven | a collar disc at the shaft base | the selection blue, as a free joint |
| Face alignment target | target tint without outline, moving face outlined | the theme's joint parent colour |
| Body selection in 3D | outline, as for a joint's child | none |
| Sensor marker ON / OFF | ON thick and opaque, OFF thin and translucent | ON state-normal, OFF neutral; 3:1 apart and on the ground |
| Light beam ON / OFF | ON thicker and opaque | same as the sensor marker (one meaning: signal on); no longer red (user's choice) |
| Conveyor emitter / absorber / guide | billboard glyphs "+" and "−" | neutral greys of different lightness, guide steel grey (user's choice) |
| Axes X/Y/Z | letters also at the ends of the ground axes | one set for stage, trihedron and view cube, red/green/blue kept with distinct lightness (user's choice); the letters are the cue where red/green cannot reach ΔE 40 |

## Rejected alternatives

- **Grey interface** (strict "grey by default"): changes the identity, which
  the user forbids; ISA-101's 3D scope is NOT VERIFIED.
- **No colour for "on"** (strict ISA "normal = no colour"): the user keeps the
  IEC green for on, energised, running, always with its glyph.
- **A new palette** (Okabe-Ito everywhere): repaints the brand and the themes;
  Okabe-Ito only sources data colours.
- **Doing nothing**: the audit shows codings told apart by hue alone (face
  target, joint arrow, sensor markers, conveyors, status dots).
- **Separating the state text tokens by lightness**: impossible at 3:1 while
  text stays at 4.5:1; the glyph rule replaces it.

## Consequences

- Every state colour in a stylesheet comes with a glyph or a word. A test
  lists the CSS selectors using `--state-*`, `--fill-*` or `--brand` against
  an allowlist naming each second cue; a new use fails until declared.
- The diagram edges, conveyor volumes and light beams look different, and the
  brand orange leaves two controls. The guide and its screenshots change.
- Pantin documents a style guide following ISA-101 doctrine and claims no
  conformance (no certification scheme found, spike 0010).
- NOT VERIFIED: highlight visibility on every imported mesh; whether red and
  green axes can reach ΔE 40 for protan and deutan vision (if not, the letters
  are the cue); dashed edges with Babylon.js edge rendering.

## Slices (viewer only, each with tests, `pnpm check` green)

1. Colour maths shared by the tests, `theme/data-palette.ts` holding today's
   literals, axes unified, `tests/viewer-colour-pairs.test.ts` with the pairs
   that pass, a "no literal colour" test.
2. State glyphs and IEC fills (status dot, I/O module list words, journal
   badges).
3. Reserved meanings in the panels (green and brand removed where they do not
   mean on or Pantin; `--sensor-mark` retired; CSS allowlist test).
4. 3D joint and face coding (driven arrow collar, face target, outline on
   every selected body).
5. Sensor markers and light beams.
6. Axes (lightness, letters at the ground axes).
7. Diagram edges and conveyor volumes.
8. Guide and screenshots (doc-writer), then the reviewer.

## Amendment to ADR 0053

- Point 2: adds `--fill-abnormal`, `--fill-emergency`, `--fill-normal` with
  their text colours; `--on-state` gives way to one text colour per fill;
  `--sensor-mark` is removed. Existing token values do not change.
- Point 3: green means only on, energised, running; pressed filters and
  toggles take the selection role; the brand orange never sits in a row or
  group with a state glyph.
- Point 4: data colours keep their roles, not their values; they may have
  per-theme values, live in `theme/data-palette.ts` and follow this ADR.
- Point 5: every selected body gets an outline, not only a joint's child.
- Point 7: the contrast test is extended by `tests/viewer-colour-pairs.test.ts`.
