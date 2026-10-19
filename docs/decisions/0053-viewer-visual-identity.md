# 0053. The visual identity in the viewer: Armoire palette, light and dark themes

- Status: accepted
- Date: 2026-10-16

## Context

ADR 0052 gave Pantin a symbol, a favicon and the "Armoire" palette, and kept
the viewer out of its scope. The user wants the viewer to carry the identity
before the 0.1 pre-release, with a light and a dark theme from the start and
the selection in blue (user statements, 2026-10-16).

The viewer has a single dark theme. Its colours are tokens in
`packages/viewer/src/styles/base.css`, used by the other stylesheets, plus a
few constants in TypeScript for the 3D scene (`scene/stage.ts`,
`scene/body-highlights.ts`, `scene/joint-arrow.ts`,
`scene/conveyor-meshes.ts`). One amber accent (#f0a030) marks at the same
time the selection, the primary actions, the forced tags and the console
warnings. ADR 0052 forbids exactly that: the brand orange never shows a
state, and states use the IEC 60204-1 colours only.

## Decision

1. **Two themes, light and dark**, as two sets of the same tokens in
   `base.css`. The Affichage menu gets "Thème : Système / Clair / Sombre",
   beside the language entry; "Système" follows `prefers-color-scheme` and
   is the default. The choice is remembered like the other preferences
   (`browser-storage.ts`, key `pantin.viewer.theme`). The page's
   `color-scheme` follows the theme, so native controls match.
2. **Tokens, from the Armoire palette** (ADR 0052 point 4). Starting values,
   checked with the WCAG 2 formula on 2026-10-16; the test of point 7 is the
   reference:

   | Token | Light | Dark | Role |
   | --- | --- | --- | --- |
   | surface-0 | #DFE2DD | #1F2528 | application ground, menu bar |
   | surface-1 | #ECEDE8 | #262D30 | panels |
   | surface-2 | #F4F4F0 | #30383C | fields, raised rows |
   | surface-3 | #FFFFFF | #3A4347 | hovered or pressed controls |
   | border | #C2C7C2 | #3E474B | dividers |
   | text | #1A1E20 | #ECEDE8 | ink |
   | text-muted | #4A5254 | #B9BEC5 | secondary text |
   | text-faint | #5A6264 | #A0A7AD | hints, disabled text |
   | brand | #B54A12 | #E3631C | primary button ground, active tab mark |
   | brand-text | #FFFFFF | #1A1E20 | text on brand |
   | selection | #1D3F8C | #7FA8EC | selection, focus ring, links |
   | state-abnormal | #7A5800 | #E8B923 | forced tag, warning (text) |
   | state-emergency | #B3261E | #F48A82 | error, failure, injected fault (text) |
   | state-normal | #2A6E3F | #5CB87A | running, active output (text) |

   Fills and badges may use the IEC hues of ADR 0052 point 5 (#F2B10A,
   #B3261E, #2E7D46) when the text on them reaches 4.5:1.
3. **Roles.** The brand orange marks only Pantin itself: primary buttons and
   the active tab or mode. The selection, in the panels and in the 3D view,
   is the selection blue. A forced tag, a warning and an abnormal condition
   use state-abnormal; an error, a failed bridge and an injected fault use
   state-emergency; a running bridge and an active output use state-normal.
   Colour is never the only cue, as before (the "F" mark, the words).
4. **What keeps its colours:** the X/Y/Z axes (grid, trihedron, view cube),
   the product materials, the energy colours of the diagram edges, and the
   joint preview's parent body colour. They code data, not the identity. The
   joint preview's child body takes the selection blue, since it shows the
   selected joint's moving side.
5. **3D view.** The scene's background and grid follow the theme (light:
   armoire-like ground; dark: the surface-1 anthracite), and change when the
   theme changes, without reloading. The body selection outline is the
   selection blue of the theme.
6. **Type and shapes.** Archivo for the interface, IBM Plex Mono for tag
   names, addresses, values and code, served by the viewer itself from
   `packages/viewer/public/fonts/` with their OFL texts: the package stays
   self-contained, at the cost of a copy of the site's woff2 files (about
   260 KB). The favicon of ADR 0052 point 3 is the tab icon. Radii stay
   between 2 and 4 px; no gradient, no drop shadow beyond what menus need to
   stand off the page.
7. **Test.** A unit test reads both token sets and checks that every text
   token reaches 4.5:1 on surface-0, -1 and -2, and brand-text on brand.

## Rejected alternatives

- Dark theme only, light later: the user wants both from the start.
- Selection in the brand orange: ADR 0052 keeps orange for the brand, and
  orange reads as "abnormal" next to IEC colours.
- The amber accent kept for forced tags: amber and the IEC yellow are close,
  but the state colour must be the same everywhere Pantin shows a state.
- Fonts shared with the site through a relative path: the viewer package
  would reach outside itself, which breaks it once built or published.
- A theme switch in the menu bar: one more control for a setting changed
  once; the Affichage menu already holds the language.

## Consequences

- Every stylesheet uses the role tokens; a literal colour outside `base.css`
  must be data (axes, materials, energies) and say so.
- The screenshots of the user guide are regenerated, and the reference
  pages describe the Thème entry, in French and English.
- The light theme is new: dialogs, menus, the diagram and the I/O view must
  be checked in it, by eye and by the screenshots.
- NOT VERIFIED: the 3D highlight colours' visibility on every kind of
  imported mesh in the light theme.

## Amendment (2026-10-18): colour blind users, joint preview colours

The project owner is colour blind: two states must never be told apart by
close hues (blue/violet, brown/green, red/orange), and colour is never the
only cue (point 3). Point 4 changes for the joint preview: the parent body
is no longer violet #a371f7 but yellow-orange (`#ffe08a` in the dark theme,
`#c25e00` in the light theme, `--joint-parent` and the scene palette's
`jointParent`), a tint without outline; the child keeps the selection
colour and gets an outline whose thickness is the same in metres whatever
the body's unit. In 3D the tints are overlays on the grey material, at 0.8
for the parent and 0.5 for the child. Under a Machado 2009 simulation
(CIE76 ΔE, protanopia / deuteranopia / tritanopia) the pure colours differ
by 86 / 90 / 50 in the dark theme and 98 / 111 / 85 in the light theme (the
old pair: 29 / 22 / 35); mixed on the grey material, by 58 / 61 / 36 and
38 / 45 / 50 (the old pair, mixed: 14 to 32). A test keeps the pure pair at
45 or more. The joint form swatches follow: a plain disc for the parent, an
outlined square for the child, next to the words. The other colour codings
of the viewer are reviewed against the same rule in ADR 0057.

## Amendment (2026-10-18): colour-blind safe coding (ADR 0057)

ADR 0057, accepted by the user, amends points 2, 3, 4, 5 and 7: state fill
tokens with their own text colours, green reserved for on, energised,
running, the brand orange never beside a state glyph, data colours grouped in
one module with per-theme values, an outline on every selected body, and a
colour pair test. The identity itself (brand, logo, themes, existing token
values) is unchanged. Details: ADR 0057.
