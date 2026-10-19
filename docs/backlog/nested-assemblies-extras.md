# Nested assemblies: extras

Phase: 8 (editing). ADR: 0040, 0055.

## Why

Left out of ADR 0040 (2026-10-04). Its first extra, collapsing a bought
sub-assembly such as a bearing, is done by ADR 0055: a sub-assembly is a rigid
group.

## What

- Guess a slider or pivot axis from the geometry (for example by picking the
  rod's cylindrical face, from the face files of ADR 0035) instead of the
  default axis [0, 0, 1] of the assembly frame.
- Metallic appearance for CAD colours named as metals ("Acier - Satiné"): the
  converter makes every material matte and non metallic
  (`packages/step-converter`, `glb_materials.py`).
