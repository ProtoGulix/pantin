# 0010. Viewer texts in translation files, French by default

- Status: accepted
- Date: 2026-09-28

## Context

The user wants a French interface, and a community project must accept new
languages without code changes (CLAUDE.md sections 1 and 2). Code, comments
and commits stay in English (CLAUDE.md section 8).

## Decision

1. Every text shown by the viewer lives in one JSON file per language in
   `packages/viewer/src/i18n/locales/<language>.json`, a flat map from a
   stable key (`tree.bodies`, `import.converting`) to a text. `fr.json` is the
   reference and the default language; `en.json` is kept complete.
2. Placeholders use `{name}` syntax. Plural forms, if needed, are separate
   keys (`tree.bodyCount.one`, `tree.bodyCount.other`), no plural engine.
3. A small pure module translates a key with parameters. Keys are typed from
   `fr.json`, so an unknown key is a type error.
4. A test checks that every language file has exactly the keys of `fr.json`
   and the same placeholders in each text.
5. The language is chosen from the browser's preferred languages among the
   available files, French as fallback; the user can override it, and the
   choice is remembered in the browser.
6. API errors are translated from their `code`; the core's English message
   is shown as a detail, never the only text.
7. No dependency: the files are bundled by Vite.

## Exception to CLAUDE.md section 8 ("never swallow an exception")

Browser storage (the remembered language and panel sizes) can be missing or
throw: private windows, blocked site data, full quota. Such an error is
caught and ignored on purpose in `packages/viewer/src/ui/browser-storage.ts`:
these are conveniences, the viewer falls back to its defaults, and reporting
the error would only add noise. No other error may be ignored this way.

## Rejected alternatives

- An i18n library (i18next, FormatJS): features not needed today; revisit if
  plural rules or formatting become complex.
- Gettext `.po` files: needs a toolchain; JSON is edited by anyone.

## Consequences

- Adding a language is adding one JSON file plus its entry in the language
  list; the key test guards completeness.
