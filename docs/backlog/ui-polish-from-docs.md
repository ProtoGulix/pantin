# Interface polish

Phase: 8 (editing). ADR: 0047, 0051, 0057.

## Why

Small defects found while documenting (ADR 0051, 2026-10-15 and 16), in the
viewer review of ADR 0022 and ADR 0047 P2.

## What

- The import form's "Axe vertical" select truncates its longest choice
  ("Y vers le haut (standard glTF)") at the inspector width.
- The I/O view's Variable column is too narrow to read a variable name.
- The joint form says the axis is in the parent body's frame; check that its
  labels "Origine/Axe (repère de « assemblage »)" agree with that hint.
- The comment of the layout switch in the toolbar code says four buttons; it
  has three (I/O alone is only in the View menu). Re-check the comment.
- The i18n key `prompt.deleteDrive.text` is unused and knip does not catch
  unused locale keys.
- Deleting a drive asks no confirmation, unlike bodies and joints; discarding
  the unsaved changes undoes it meanwhile.
- A value typed in a float command input is lost when the panel redraws after
  the input lost focus (for example after ticking a fault).
- Shift+F10 does not open the tree's context menu (a right click and the
  ContextMenu key do); it applies to every row.
- Home page screenshot (`scripts/docs-screenshots/capture-views.ts`): the status bar
  counts 2 warnings in the English picture (`en/home-light.webp`, `en/overview.webp`)
  and 0 in the French one, on the same example (schema 13, so not a migration
  message). The messages themselves were not read; whether core console messages are
  translated is a separate question.
