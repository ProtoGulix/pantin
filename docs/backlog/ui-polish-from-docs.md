# Interface polish found while documenting

Found while writing and illustrating the user guide (ADR 0051), on 2026-10-15
and 2026-10-16:

- The import form's "Axe vertical" select truncates its longest choice
  ("Y vers le haut (standard glTF)") at the inspector width.
- The I/O view's Variable column is too narrow to read a variable name
  (`verin1_verin1_coil_14` shows as "verin1_v…").
- The joint form labels read "Origine/Axe (repère de « assemblage »)" while
  its hint says the axis is in the parent body's frame.
- The toolbar comment of the layout switch says four buttons; it has three
  (E/S seules is only in the Affichage menu).
- The i18n key `prompt.deleteDrive.text` is unused, and knip does not catch
  unused locale keys.
- The viewer cannot choose which nodes of an imported file become bodies, nor
  merge or split bodies after import (CLAUDE.md phase 8, "choix des noeuds").
