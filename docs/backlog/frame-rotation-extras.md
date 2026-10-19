# Frame rotation extras

Phase: 8 (editing). ADR: 0056.

## Why

ADR 0056 aligns a group's frame on a joint axis. Its "Backlog" section lists
other ways to give the rotation.

## What

- Numeric rotation.
- A picked face (cylinder axis or plane normal).
- X or Y as the target axis instead of Z.
- Origin moved to the joint origin or to the picked point.
- A "Réorienter le repère…" entry in the group's context menu.
