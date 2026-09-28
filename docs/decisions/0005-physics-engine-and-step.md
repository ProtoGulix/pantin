# 0005. Physics engine build and simulation step

- Status: accepted
- Date: 2026-09-28
- Source: spike 0002 (docs/spikes/0002-rapier-headless-node.md)

## Context

Spike 0002 measured the Rapier 3D builds headless under Node 24. The compat
builds load without browser APIs; all builds are bit-reproducible run to run
on one machine; the SIMD build is about 2.4 times faster but produces
different results from the non SIMD builds. At 500 boxes the deterministic
build needs 5.1 ms per step (i3-10100).

## Decision

1. Physics uses `@dimforge/rapier3d-deterministic-compat` pinned at exactly
   0.21.0 (Apache-2.0). The SIMD build is not used, even for large scenes:
   bit-for-bit reproducibility is worth more, because tests compare exact
   states and the reset relies on snapshot/restore.
2. The default simulation step is 1/120 s, which leaves margin for 500 boxes
   (5.1 ms per step against an 8.3 ms budget).
3. Straight conveyors: a kinematic belt body moved by code at the surface
   speed, reset to its home pose after each step.
4. Presence sensors: ray casts run after each step, not Rapier sensor
   colliders (their events arrive 1 to 2 steps late).

## Rejected alternatives

- SIMD build: faster, but reproducibility differs from the reference build
  and portability of SIMD WASM is an extra variable.
- 1/240 s step: exceeds the budget at 500 boxes with the chosen build.
- Setting box velocities directly: pushes boxes through end stops (0.46 m in
  the spike).

## Consequences

- Rapier is added to `@pantin/core` only when phase 6 (products) starts,
  with the user's approval at that time.
- NOT VERIFIED and to cover later: curved conveyors, rollers, transfers
  between belts, long runs, sleeping bodies, cross-machine reproducibility.
