# Joint star view: extras

Phase: 8 (editing). ADR: 0059, 0057, 0055.

## Why

ADR 0059 makes the first joint star view a read-only picture of the
kinematic structure. It left three ideas out to keep that first version
small.

## What

- Live state on the edges: the joint position while the simulation runs,
  and the injected "grippé" fault, which is a state, so red with its cross
  glyph (ADR 0057 rules 1 and 3).
- A mark on the joints watched by a sensor, next to the actuator mark.
- Editing from the view, for example dragging a node onto another parent to
  change a joint's parent: a new command, with its own ADR.
- Cross-links between branches, for example from an actuator to the joints
  it moves, or from a sensor to the joint it watches, drawn with their own
  line style (never colour alone), as in the reference picture of the
  ADR 0059 amendment of 2026-10-19.
