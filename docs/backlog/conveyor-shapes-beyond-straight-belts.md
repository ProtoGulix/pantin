# Conveyors beyond the straight belt

Phase: conveying and physics (after phase 6). ADR: 0043 point 3, spike 0002.

## Why

Phase 6 only moves products on straight belts. Real lines have curves,
rollers and hand-overs between belts. None of the three is verified (spike
0002 only checked method A, a kinematic belt body on a straight run).

## What

- Curved belt: the surface velocity must turn along the curve, which the
  kinematic body method does not give. NOT VERIFIED.
- Roller conveyor, driven or free: each roller as a continuous joint with a
  cylinder collider would reuse the drive chain. Cost at many rollers and
  contact behaviour NOT VERIFIED.
- Transfer from one belt to the next (gap, height step, two speeds): needs a
  test scene and probably guides at the junction. NOT VERIFIED.

Adding any of these first needs `primitive-kind-cost.md` settled, to avoid
touching dozens of files per kind.
