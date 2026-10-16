# Pantin visual identity

The decision and its reasons are in [ADR 0052](../decisions/0052-visual-identity.md).
This folder holds the masters. The documentation site (VitePress) uses them through `docs/site/public/` and `docs/site/.vitepress/theme/`.

| File | Use |
| --- | --- |
| `pantin-logo.svg` | Main logo on a light ground: the DIN rail runs over the wordmark, the puppet hangs from it |
| `pantin-logo-dark.svg` | Main logo on a dark ground |
| `pantin-symbol.svg` | Symbol alone, light ground (README avatar, about box) |
| `pantin-symbol-dark.svg` | Symbol alone, dark ground |
| `pantin-favicon.svg` | Favicon and app icon, 16 to 512 px; a glyph drawn for small sizes, not a reduced symbol |
| `colors.css` | Colour, type and radius tokens |

## Rules

- The rail is always straight and horizontal.
- Orange is the brand: strings and the rail LED. It never shows a machine
  state. States use the IEC 60204-1 colours only.
- On a light ground, use `--pantin-bornier-light`; `--pantin-bornier` falls
  to 2.3:1 there.
- Below 48 px, use the favicon glyph, never the symbol.
- No gradient, no drop shadow, no outline added to the symbol.

## Before publishing outside the repository

The two logo files keep the wordmark as live text in Archivo ExtraBold.
Without the font installed, a viewer falls back to another sans serif.
Convert the text to paths (Inkscape: Path > Object to Path) and commit the
result as `pantin-logo-outlined.svg` / `pantin-logo-dark-outlined.svg`
before any use on a website, a package registry or print.
