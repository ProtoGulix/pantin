# Spike 0010. ISA-101 and colour blind safe colour for the viewer

- Date: 2026-10-18
- Covers: the 2026-10-18 request of the project owner (colour blind): the 3D view and the
  menus conform to ISA-101 and never rely on close hues (blue/violet, brown/green,
  red/orange). Amends nothing yet; feeds a later amendment to ADR 0053.
- Method: web search and page fetches on 2026-10-18; ADR 0053 and `packages/viewer/src/styles/base.css`
  read in the repository. No standard text was available (paywalled). Nothing was run.
- Note on numbering: the last report in `docs/spikes` is 0009, so this one is 0010.

## Verdict

1. The text of ANSI/ISA-101.01-2015 could **not** be read. Everything below about its colour
   content comes from the ISA committee page and from secondary sources. The only
   point that is consistent across all of them: colour is a minor facet of the standard, the
   usual doctrine is "grey by default, colour for abnormal", and colour must not be the only cue.
2. Almost nobody applies ISA-101 to a **3D CAD-like editor**. The standard targets process
   operator displays (2D, level 1 to 4). It is a guide for the status colours and the grey
   discipline, not a spec for a viewer that must also show selection, joint frames and axes.
3. The identity of ADR 0053 stays intact (user constraint). Real conflicts with the "grey by
   default" doctrine are few: green for the normal state and the brand orange next to the
   amber/red states. Both are handled by rules and redundant cues, not repainting (section 5).
   The work is in the coding of data and states: glyphs, line styles, lightness gaps.

## 1. What ISA-101.01-2015 says about colour

### 1.1 Verified (primary, public page)

- ISA committee page (<https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa101>,
  fetched 2026-10-18 through a summarising fetch): the committee's documents target people who
  design, implement, use or manage HMIs in manufacturing; "graphics and color conventions"
  and "menu hierarchies" / "screen navigation conventions" are listed among the areas of work.
  This confirms the **topics**, not any rule.
- The standard was approved in July 2015 as ANSI/ISA-101.01-2015, with the technical
  reports ISA-TR101.01 and ISA-TR101.02 for practice (secondary: Control.com article below).

### 1.2 Secondary sources (not the standard; wording may differ)

| Statement | Source | Strength |
| --- | --- | --- |
| Colour is "only one small facet" of the standard, though the best known | Control.com, "Going Gray: A New HMI Standard" (<https://control.com/technical-articles/going-gray/>, search snippet; the page itself returned HTTP 403 to the fetch tool) | Secondary |
| High-performance HMI: neutral low-contrast grey backgrounds, flat 2D elements, no gratuitous 3D, bright saturated colours reserved for abnormal conditions and prioritised alarms | Study guide <https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/hmi-design-isa101> (search snippet) | Secondary, attributes to "High-Performance HMI design", a book/method, not to ISA-101 clauses |
| Colour should not be the only indicator of an important condition; colours must be distinguishable by operators | Training handout quoted by the same search | Secondary |
| Dual indication / redundant coding "for the benefit of colour blind operators" | Alarm-graphics rules and a SINTEF/IFE presentation (<https://www.sintef.no/globalassets/project/hfc/documents/04-nimmo-ife-norway-2018-final-25th-2-pgs.pdf>, result snippet; the PDF itself returned 404) | Secondary |
| Four display levels: 1 overview, 2 control, 3 detail, 4 support/diagnostics; "level numbering and content vary between sources" | Tatsoft FrameWork X how-to (<https://docs.tatsoft.com/display/FX/ISA-101+HMI+Compliance+How-to>, fetched) and SINTEF snippet | Vendor, cites no clause |
| Navigation: home button, breadcrumbs, area selector, alarm summary always visible, any display within fewer than three clicks | same Tatsoft page | Vendor, cites no clause |
| Alarm colours red critical, orange high, yellow medium, cyan low, purple suppressed | same Tatsoft page, headed "ISA-18.2 Aligned" | Vendor values; the page itself says nothing about the standard's text |

The same Tatsoft page contradicts itself: its best-practice list says "colour only for abnormal
conditions" while its example fills running pumps green and uses blue for manual mode. This is
a good illustration of how loosely "ISA-101 compliant" is used.

### 1.3 Requirements versus recommendations

**NOT VERIFIED.** I could not establish which of the above are "shall" and which are
"should" clauses. From the public record, ISA-101.01 is a lifecycle and work-process standard
(HMI philosophy, style guide, design, implementation, operation, maintenance), and the colour
rules are expected to live in the **style guide each plant writes**, with ISA-TR101.02 giving
examples. That reading is an inference from the committee's scope and the secondary sources, not
a quotation. Consequence: "conform to ISA-101" cannot be checked mechanically; what Pantin can
do is write its own style guide that follows the doctrine, and say so.

Also NOT VERIFIED: any reserved colour list in the standard itself, the exact level
definitions, any statement about 3D views, and any statement about colour vision deficiency
beyond the generic redundant-coding advice.

## 2. Relation to IEC 60204-1 and ISA-18.2, and conflicts with ADR 0053

### 2.1 IEC 60204-1 (machine indicator lights)

Secondary sources only (PLCTalk quoting Table 3, vendor pages; standard not read):
red = emergency situation, yellow = abnormal condition, green = normal condition, blue =
mandatory action (for example a reset), white/grey = no specific meaning (white is used for
confirmation or monitoring; "white = neutral" is practice, not verified as a requirement).
Other meanings may be agreed between supplier and purchaser, with IEC 60073 as the base.
Sources: <https://www.plctalk.net/threads/indicator-coloring-scheme.115832/>,
<https://industrialmonitordirect.com/blogs/knowledgebase/iec-requirements-for-distribution-panel-indicator-lights>.

Scope difference, which matters: IEC 60204-1 colours **physical lights and buttons on a
machine** and puts a meaning on green ("normal"). ISA-101 doctrine is about **screens** and
treats "normal" as grey/no colour. The two are compatible only if the screen reserves the
IEC colours for **conditions** and does not paint normal equipment.

### 2.2 ISA-18.2 (alarm management)

ISA-18.2-2016 is the alarm lifecycle standard (rationalisation, priorities, shelving,
suppression). The public snippets give no colour rule; the red/orange/yellow/cyan scheme found
comes from a vendor. **NOT VERIFIED** whether the standard prescribes any colour or shape. The
colour-blind relevance is direct: red/orange as priority levels is exactly the pair the owner
cannot tell apart, so priority must also be carried by a number, shape or label.

### 2.3 Conflicts with ADR 0053

| ADR 0053 choice | Issue | Severity for the owner |
| --- | --- | --- |
| `state-normal` green (running bridge, active output) | Painting normal in colour is the "rainbow display" the doctrine avoids; IEC 60204-1 does give green for normal, so this is a doctrine conflict, not an IEC conflict | Low if the word/icon is always present |
| Brand orange `brand` (#B54A12 light, #E3631C dark) beside `state-abnormal` amber and `state-emergency` red | Orange sits between amber and red; the owner's red/orange pair. ADR 0052 forbids orange for state, which helps, but both appear side by side in the same panels | High |
| Selection blue `selection` | Blue is IEC "mandatory action", yet blue selection is the common CAD convention and the owner asked for it; fine | Low |
| `state-abnormal` (#7A5800 light, #E8B923 dark) versus `state-normal` (#2A6E3F light) | Dark brown-ish yellow versus dark green in the light theme: the brown/green pair the owner cannot separate. Lightness alone is close (both dark, mid-chroma) | High (light theme) |
| Diagram edge energy colours (ADR 0053 point 4) | Data coding by hue; actual values not checked here, see section 4 | To check |
| X/Y/Z axes red/green/blue | Red/green pair; the colour is a convention but letters on the trihedron and view cube already give a second cue | Medium |
| `sensor-mark` #58A6FF / #1F5FA8 | Blue, safe as long as ON/OFF is also shown by fill versus outline | Low |
| Joint parent #FFE08A / #C25E00 versus child selection blue | Already fixed in the 2026-10-18 amendment (Machado 2009, ΔE76 >= 50 for protanopia, deuteranopia, tritanopia) plus disc/square swatches | Done |

## 3. Colour vision deficiency: safe practice

### 3.1 Facts and sources

- Okabe-Ito palette (Okabe and Ito 2008 "Color Universal Design", popularised by Wong 2011,
  Nature Methods 8(6):441, doi:10.1038/nmeth.1618): black #000000, orange #E69F00, sky blue
  #56B4E9, bluish green #009E73, yellow #F0E442, blue #0072B2, vermilion #D55E00, reddish purple
  #CC79A7. Hex values confirmed by two secondary pages (NYU Siegal lab
  <https://siegal.bio.nyu.edu/color-palette/>, ConceptViz). The Okabe-Ito page
  <https://jfly.uni-koeln.de/color/> (fetched) confirms the advice but shows the palette only as
  an image, and gives vermilion as RGB 100%, 32%, 0%. **The hex table is not read from the
  primary source.** Note the palette is designed for **categorical data** and is not an alarm scheme.
- Advice on that page (verified): do not rely on colour alone, add shape, line style, symbols
  or hatching; label directly instead of using a legend; use thicker lines and larger symbols;
  avoid red on green; avoid colours between yellow and green; alternate warm and cool hues, and
  when two warm or two cool hues are paired make their brightness or saturation clearly different;
  prefer darker blue and orange over sky blue and yellow for thin lines and small text.
- Simulation: Machado, Oliveira, Fernandes, "A Physiologically-based Model for Simulation of Color
  Vision Deficiency", IEEE TVCG 15(6), 2009, pp. 1291-1298, doi:10.1109/TVCG.2009.113
  (<https://www.inf.ufrgs.br/~oliveira/gmmachado.html>). Covers protanomaly/deuteranomaly and
  dichromacy (about 99.96 % of cases per the authors) as a severity-parameterised 3x3 matrix.
  Tritan matrices are in the authors' CVD-simulation page (search result
  <https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html>, not fetched).
  Brettel/Viénot 1997-1999 are the older dichromacy projections; **not fetched in this spike,
  NOT VERIFIED** beyond my background knowledge. ADR 0053's amendment already uses Machado 2009.
- WCAG 2.2 (fetched 2026-10-18): SC 1.4.1 Use of Color, **Level A**: "Color is not used as the
  only visual means of conveying information", indicating an action, prompting a response or
  distinguishing a visual element
  (<https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>). SC 1.4.11 Non-text Contrast,
  **Level AA**: user interface components needed to identify them and their states, and graphical
  objects needed to understand the content, need at least 3:1 against adjacent colours
  (<https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>). 1.4.11 constrains
  lightness, not hue, so it is the check that matters most for a viewer that avoids relying on hue.
  WCAG 2.x is a web accessibility guideline, not a rule for 3D scene content; applying it to the
  canvas is a project choice.

### 3.2 Rules of thumb used in the recommendations (from the above plus common practice)

1. Separate states by **lightness** first (a luminance ratio of at least 3:1 between the two
   members of any pair), hue second.
2. Never use two of the owner's problem pairs as the only difference.
3. Every state also has a second cue: shape, fill versus outline, line style, icon or word.
4. Prefer the blue / orange / grey axis: blue versus orange-yellow survives all three common
   deficiencies, which is why the joint amendment works.
5. Check by simulation (Machado 2009 matrices) in a unit test, as the amendment already did.

## 4. Audit of the viewer's colour codings (only the ones named in ADR 0053 / base.css)

Read from `packages/viewer/src/styles/base.css` and ADR 0053. **NOT AUDITED**: the diagram edge
energy colour values, the X/Y/Z axis values in `scene/`, body highlights in
`scene/body-highlights.ts`, and the product materials; I was told not to edit and did not read
those files. They are the next step.

Pairs in the current tokens that rely on hue:

- Light theme: `state-abnormal` #7A5800 versus `state-normal` #2A6E3F versus `state-emergency`
  #B3261E. Three dark, mid-chroma colours: classic brown / green / red confusion for the
  owner. They are used as **text** colour with words today, which is a legitimate second cue,
  but the badges and fills of point 2 (#F2B10A, #B3261E, #2E7D46) are hue-only unless a glyph
  or word is always inside.
- Dark theme: #E8B923 (amber), #F48A82 (salmon), #5CB87A (green) have more lightness spread
  (amber lightest, salmon medium, green darker) but green versus salmon is still a red/green pair.

## 5. Recommendations for a 3D CAD-like viewer, identity kept intact

Constraint from the user (coordinator message, 2026-10-18): the identity of ADR 0053 stays as
it is (brand colour, logo, light/dark themes, overall look, no grey-only UI). Only the
**coding of information** changes, so that colour-deficient users can find their way. So the
doctrine of section 1 is applied as far as it fits, not as a repaint. Where the standard's
own doctrine (grey by default, colour only for abnormal) conflicts with the identity, that is
stated and the least intrusive option is proposed. Where the standard is silent (3D,
selection, axes), these are design choices.

### 5.1 Measures that cost nothing in identity (all recommended)

1. **Redundant cues on every coding** (WCAG 1.4.1, and the redundant-coding advice of
   section 1.2): icon, shape, text, fill versus outline, line style or pattern. This is the
   main measure and touches no palette token.
2. **Lightness gap inside each pair** shown together (luminance ratio >= 3:1, WCAG 1.4.11
   logic), so a pair stays separable even if the hues merge. Adjust the lightness of data
   colours, not the hues of the identity.
3. **A simulation test** (Machado 2009: protan, deutan, tritan) on all state and data colour
   pairs, as the 2026-10-18 amendment did for the joint pair.

### 5.2 Per coding (identity untouched)

| Coding | Current | Change | Second cue |
| --- | --- | --- | --- |
| States (abnormal / emergency / normal) | amber / red / green tokens | keep the tokens; in the light theme widen the lightness gap between `state-abnormal` #7A5800, `state-normal` #2A6E3F and `state-emergency` #B3261E (today three dark mid-chroma colours); verify by simulation | always a distinct glyph or word with the colour: triangle "!" abnormal, octagon or cross emergency, check mark normal; badges with fill never colour only |
| Selection | blue outline in 3D, blue tint in panels | keep | outline of 2 px or more on screen, not a tint alone; a bold row marker in the tree |
| Joint parent / child | amended 2026-10-18 | keep | disc versus square swatches already present |
| Sensor ON / OFF | `sensor-mark` blue, ON/OFF probably by tone | keep the blue | filled marker ON versus ring OFF, plus "ON/OFF" text in the inspector (NOT AUDITED in scene code) |
| Diagram edge energies | one hue per energy | choose hues from the Okabe-Ito set (blue #0072B2, orange #E69F00, sky blue #56B4E9, vermilion #D55E00, bluish green #009E73) with distinct lightness, avoid vermilion next to bluish green | line style per energy (solid, dashed, dotted, double), plus an energy abbreviation or icon on the edge label |
| Axes X/Y/Z | red / green / blue | keep the CAD convention; use the Okabe-Ito version (vermilion, bluish green, blue) at different lightness | letters X Y Z on gizmo, view cube and axis lines; axis lines of different thickness or dash |
| Joint arrow, face target | colour | keep identity colours; check lightness against the body and background in both themes | arrow head shape; face target with a hatched or dotted outline and a label (NOT AUDITED) |
| Faults, forced tags | amber and red | keep | "F" mark (exists), "!" icon, word |

### 5.3 Where ISA-101 doctrine and the identity truly conflict

1. **Green for "normal"** (`state-normal`). Doctrine: normal equipment is grey. Identity and
   IEC 60204-1: green is the normal colour. Least intrusive option: keep green, restrict it to
   the IEC-coded bridge and output indicators, never paint a body or a tree row green for being
   normal, and always add the check glyph. A stricter option (remove green, show normal by glyph
   only) is possible but is a visible change; not recommended under the user's constraint.
2. **Brand orange next to amber and red.** Doctrine: bright colour is reserved for
   abnormal; the orange of the brand is not a state. This is exactly the red/orange pair
   the owner cannot separate. Least intrusive option: keep the orange, but forbid placing a
   brand-orange element and a state badge in the same row or toolbar group, and give every
   state badge a glyph (so the orange is never confused for a state, as ADR 0052 already
   intends). A rule, not a repaint.
3. **Axis colours.** The CAD convention outranks ISA-101 here (the standard targets operator
   screens, inferred, NOT VERIFIED); keep colours, tune lightness, add letters.
4. **The 3D view is not grey and flat.** Doctrine asks for flat 2D and no gratuitous 3D; the
   product is a 3D viewer. Not a conflict worth acting on: ISA-101 is about process operator
   displays, and the 3D view is the product's purpose.

### 5.4 Menus and layout

Already neutral and on identity. ISA-101 navigation advice (breadcrumbs, always visible alarm
summary, few clicks) is vendor-sourced and about process displays; the single item worth
adding is a fault and forced-tag counter in the menu bar with an icon and a number, which
needs no colour.

### 5.5 Proposed checks (later slice, not done here)

1. A unit test that runs the Machado 2009 matrices over every state and data colour pair shown
   together, requiring CIE76 delta E >= 40 and a lightness ratio >= 3:1.
2. A review rule: every `--state-*` use also renders a glyph or a word.
3. An amendment to ADR 0053 (point 4 data colours and point 3 glyph rule) with the owner's
   agreement (CLAUDE.md section 14.8). The brand, themes and tokens of point 2 do not change,
   except possibly the light-theme state lightness gap, which stays inside the existing roles.

## 6. NOT VERIFIED summary

- The text of ANSI/ISA-101.01-2015 and ISA-TR101.02: no clause, no shall/should split, no reserved
  colour list, no level definitions.
- Whether ISA-18.2 prescribes any colour or shape.
- The IEC 60204-1 Table 3 text, only secondary quotes; "white/grey = neutral" is practice.
- Okabe-Ito hex values from the primary source; Brettel/Viénot methods; the tritan matrices.
- The actual values and ΔE of ADR 0053's diagram energy colours, axis colours, body highlight
  colours, `sensor-mark` and product materials under simulation.
- Any claim that a product is "ISA-101 certified": no certification scheme was found.
- Whether a 3D editor view falls inside the standard's scope (inferred: no).
- The Control.com article and SINTEF PDF could not be fetched (HTTP 403 and 404); they are cited
  from search snippets only.

## Sources

- <https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa101> (fetched)
- <https://control.com/technical-articles/going-gray/> (snippet only)
- <https://docs.tatsoft.com/display/FX/ISA-101+HMI+Compliance+How-to> (fetched)
- <https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/hmi-design-isa101> (snippet only)
- <https://www.sintef.no/globalassets/project/hfc/documents/04-nimmo-ife-norway-2018-final-25th-2-pgs.pdf> (snippet only)
- <https://www.plctalk.net/threads/indicator-coloring-scheme.115832/> (snippet)
- <https://industrialmonitordirect.com/blogs/knowledgebase/iec-requirements-for-distribution-panel-indicator-lights> (snippet)
- <https://jfly.uni-koeln.de/color/> (fetched)
- <https://siegal.bio.nyu.edu/color-palette/> (snippet)
- <https://www.inf.ufrgs.br/~oliveira/gmmachado.html> (snippet)
- <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html> (fetched)
- <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html> (fetched)
- Repository: `docs/decisions/0053-viewer-visual-identity.md`, `packages/viewer/src/styles/base.css`
