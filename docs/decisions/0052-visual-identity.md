# 0052. Visual identity of the documentation site: the walking puppet, the DIN rail and the Armoire palette

- Status: accepted
- Date: 2026-10-16

## Context

Pantin has no logo, no favicon and no colour rules. The documentation is
built with VitePress, and the same site will probably be the project page
(user statement, 2026-10-16). This ADR covers that site and the README. The
viewer is out of scope: adopting these tokens in the viewer needs its own
decision.

The name comes from the jointed figure whose strings the PLC pulls
(CLAUDE.md section 1). The user explored the identity on 2026-10-16:
symmetric puppet, wooden puppet, puppet sitting on the rail, robot arm,
string robot, gantry. The user chose the walking puppet hung from a
straight DIN rail (exploration "P2"), its horizontal lockup and a dedicated
favicon glyph, and rejected the circular stamp.

Facts checked on 2026-10-16:

- IEC 60204-1 gives indicator colours a meaning: red for a dangerous
  condition needing immediate action, yellow for an abnormal condition,
  green for normal, blue for a mandatory operator action, white for
  monitoring (Schneider Electric FAQ FA146188; Schneider also groups
  orange with yellow as "abnormal").
- RAL publishes no official sRGB value; published conversions differ
  (RAL 7016: #373F43 at w3schools, #293133 elsewhere).
- Archivo is under the SIL Open Font License 1.1 (`OFL.txt` of
  github.com/Omnibus-Type/Archivo). IBM Plex Mono is under the same licence,
  with the reserved font name "Plex" (`LICENSE.txt` of the release
  `@ibm/plex-mono@2.5.0`, github.com/IBM/plex).
- VitePress's default theme is customised by overriding root CSS
  variables (`--vp-c-brand-1`, `--vp-c-brand-2`...), and importing
  `vitepress/theme-without-fonts` keeps the bundled Inter font out of the
  build, with `--vp-font-family-base` and `--vp-font-family-mono` for the
  replacement fonts (vitepress.dev, "Extending the Default Theme").
- Contrast ratios below were computed with the WCAG 2 relative luminance
  formula on the hex values of this ADR.
- On VitePress 1.6.4, the version pinned by ADR 0051:
  `vitepress/theme-without-fonts` exists, dark mode is the `.dark` class,
  `themeConfig.logo` and the light/dark form of `hero.image` are accepted,
  and `--vp-button-brand-text`, `--vp-home-hero-name-color` and
  `--vp-home-hero-image-background-image` are defined in the default
  theme's `vars.css`. `--vp-code-block-radius` is not: code blocks get their
  radius from a rule instead.
- The 16 and 32 px favicon reads in headless Chromium, on a light and a dark
  ground.

NOT VERIFIED:

- Prior art for the figurative mark (EUIPO, INPI, classes 9 and 42), in
  addition to the word mark left open by spike 0004.
- Rendering of the 16 px favicon in real browser tabs (only headless
  Chromium was checked).

## Decision

1. **Symbol.** A puppet walking in profile, hung by three strings (head,
   front hand, front knee) from a straight, horizontal DIN rail with one
   LED. Near limbs in full ink with ring joints; far limbs thinner and
   lighter, behind the body. The rail is never tilted.
2. **Main logo.** The rail runs over the whole wordmark "pantin", lowercase,
   Archivo ExtraBold; the puppet hangs from it at the left. Masters in
   `docs/brand/`, light and dark.
3. **Favicon.** A dedicated 32-unit glyph (heavier strokes, bigger head, no
   joints), dark on an orange rounded square. Below 48 px only this glyph
   is used.
4. **Palette "Armoire".** Colours taken from the workshop, as tokens in
   `docs/brand/colors.css`:

   | Token | Hex | Role |
   | --- | --- | --- |
   | armoire | #CFD3CE | light ground, about RAL 7035 |
   | paper | #ECEDE8 | raised light surface |
   | anthracite | #30383C | dark ground, about RAL 7016 |
   | graphite | #1A1E20 | ink |
   | bornier | #E3631C | brand accent on dark grounds |
   | bornier-light | #B54A12 | brand accent on light grounds |
   | ficelle | #C9B38A | second plane, tag addresses on dark |
   | commande | #1D3F8C | links, selection, focus |

5. **Machine states follow IEC 60204-1** and nothing else: emergency
   #B3261E, abnormal #F2B10A, normal #2E7D46, mandatory #1F5FA8,
   monitoring #F4F4F0. The brand orange is never used for a state, since
   orange reads as "abnormal".
6. **Type.** Archivo for text, titles and the wordmark; IBM Plex Mono for
   code and machine data (tag addresses, tag names, values, cycle times).
   The site serves both fonts itself from `docs/site/.vitepress/theme/fonts/`,
   with their OFL licence: no request to Google Fonts or any CDN, and no
   Inter (`vitepress/theme-without-fonts`).
7. **Style.** Flat colours, no gradient, no drop shadow, radii of 2 to 4 px.
8. **VitePress mapping** (`docs/site/.vitepress/theme/pantin.css`). Light: paper
   ground #ECEDE8, sidebar #DFE2DD, links #9A3E0F (bornier darkened for
   text), brand buttons #B54A12 with white text. Dark: ground #262D30,
   sidebar #30383C, links #F59A62, brand buttons #E3631C with graphite text.
   Tip callouts use commande blue; warning and danger use the IEC yellow and
   red, darkened or lightened for text. The home page name is flat ink, no
   gradient. Nav bar logo: the favicon glyph; home hero image: the symbol,
   light and dark.
9. **Measured contrasts** (WCAG 2, AA is 4.5:1 for text). Light: graphite on
   paper 14.3:1; text-2 #4A5254 on paper 6.8:1; links on paper 5.8:1, on
   the sidebar 5.2:1; white on brand button 5.3:1; warning text 4.6:1;
   danger text 5.6:1; commande on paper 8.3:1. Dark: paper on ground
   11.9:1; text-2 7.5:1; links 6.5:1; graphite on brand button 4.9:1; tip
   5.1:1; warning 7.6:1; danger 5.2:1. Bornier #E3631C fails as text on
   light grounds (2.3:1 on armoire) and is kept for graphics there.

## Rejected alternatives

- Symmetric puppet: static, read as a pictogram rather than a motion.
- Tilted control bar (puppeteer's cross): the user wants the DIN rail
  straight.
- Robot designs (arm under the rail, string robot, gantry): the string robot
  held best at 16 px, but the puppet carries the name; the gantry does not
  survive small sizes.
- Wooden puppet and puppet sitting on the rail: more toy than tool.
- Circular stamp: rejected by the user.
- Kinematic "P" monogram: abstract, loses the puppet.
- Brand orange as the warning colour: conflicts with IEC 60204-1.

## Consequences

- New folder `docs/brand/` with the SVG masters, `colors.css` and a README
  of usage rules. CLAUDE.md section 4 lists it.
- New VitePress theme files: `docs/site/.vitepress/theme/index.ts`,
  `fonts.css`, `pantin.css`; `docs/site/public/` holds `favicon.svg` and the
  two symbols. The site config links the favicon and sets the nav bar logo,
  and both home pages show the symbol.
- The woff2 files (Archivo 400, 700, 800; IBM Plex Mono 400, 500) and their
  OFL licences are committed under `docs/site/.vitepress/theme/fonts/`,
  about 260 KB. No npm dependency is added.
- The root README shows the symbol, not the logo: the logo's live text
  would fall back to another font on GitHub.
- The viewer keeps its colours. A later ADR may adopt the tokens there
  (favicon, state badges, console levels of ADR 0031).
- The logo masters keep live text; outlined copies are required before any
  use outside the repository (`docs/brand/README.md`).
- To verify next: the NOT VERIFIED points above, then a real favicon test.
- The proposal was drafted outside the repository as "0040", a number
  already taken (ADR 0040, nested assemblies from STEP); it was renumbered
  0052 and its paths adapted to the site's place, `docs/site/` (ADR 0051).
