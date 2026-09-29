# Axis

A minimal valid Pantin (ADR 0021): a 400 mm rail and a carriage on a
prismatic joint with 340 mm of travel, in one assembly. Its tags are
`axis.stroke.setpoint` and `axis.stroke.position`, in metres.

    pnpm pantin validate examples/axis

The phase 1 exit test validates this folder and refuses broken copies of it.
To open it in the viewer, copy the folder into the pantins directory the
core serves.
