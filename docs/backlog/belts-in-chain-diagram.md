# Belts in the chain diagram

Phase: 8 (editing). ADR: 0029, 0043 point 3.

## Why

The chain diagram shows drives, actuators and joints. A belt ends the chain
contactor, motor, drum but is not drawn: the diagram (`packages/viewer/src/
diagram/`) has no belt node, so the last link of the chain is invisible.

## What

Draw the belt as the last node of a chain that ends on its drum joint.
