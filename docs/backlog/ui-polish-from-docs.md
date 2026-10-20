# Interface polish

Phase: 8 (editing). ADR: 0047, 0051, 0057.

## Why

Small defects found while documenting (ADR 0051, 2026-10-15 and 16), in the
viewer review of ADR 0022 and ADR 0047 P2. The viewer defects of the list are
fixed; what remains needs a decision or is not a viewer fix.

## What

- Deleting a drive asks no confirmation, unlike bodies and joints; discarding
  the unsaved changes undoes it meanwhile. It needs a decision (drives only, or
  actuators and sensors too) and a new prompt text.
- Home page screenshot (`scripts/docs-screenshots/capture-views.ts`): the status bar
  counts 2 warnings in the English picture (`en/home-light.webp`, `en/overview.webp`)
  and 0 in the French one, on the same example (schema 13, so not a migration
  message). The messages themselves were not read; whether core console messages are
  translated is a separate question.
