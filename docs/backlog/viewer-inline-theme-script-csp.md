# Inline theme script and a future Content-Security-Policy

Phase: debt (security). ADR: 0053, 0046.

The viewer's `index.html` sets the theme with a small inline script before the
first paint (ADR 0053), so that a light page never flashes dark. The core sends
no Content-Security-Policy today, so nothing blocks it. If a CSP is added (for
example while hardening the exposure, ADR 0046), allow this script by its
hash or move it to a file served before the stylesheets.
