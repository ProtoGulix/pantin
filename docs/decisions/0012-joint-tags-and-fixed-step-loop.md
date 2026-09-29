# 0012. Joint tags and the fixed-step loop

- Status: accepted
- Date: 2026-09-29

## Context

Phase 2 ends when an axis moves because a tag was written, tested without the
viewer (CLAUDE.md section 13.2), with the core running at a fixed step of
1/120 s (ADR 0005). Drives, which will turn command tags into motion with
speeds and ramps, belong to phase 4. The I/O list as a CSV and the PLC bridge
belong to phase 7. This phase needs the smallest tag model that lets those
later phases add to it without rewriting it. The user approved the plan on
2026-09-29.

## Decision

1. Tags of this phase are derived from the joints, not declared in
   `pantin.json`: the document schema does not change. Every joint that can
   move (all but `fixed`) exposes two tags:
   - `<jointId>.setpoint`: command (written by the PLC or a client), float;
   - `<jointId>.position`: feedback (written by the core), float.
   Values are in SI units: metres for prismatic joints, radians otherwise.
   The name is relative to the Pantin; the instance prefix (`instance.tag`,
   ADR 0002) comes with part instances.
2. The protocol describes a tag by name, type (`bit`, `integer`, `float`,
   CLAUDE.md section 5.6) and direction (`command`, `feedback`) so that
   declared tags can join later. Only `float` exists yet.
3. Writing a command tag stores its value and queues it; the next simulation
   step consumes the queue. Writing a feedback tag is refused
   (`invalid_request`); forcing tags comes with the inspector (phase 8).
4. The step is a pure function of the document, the joint positions and the
   queued setpoints. In this phase it moves each joint straight to its queued
   setpoint, clamped to the limits: a stand-in for drives, which phase 4 puts
   in its place. Because only queued writes are applied, the editor's direct
   `PUT .../position` (ADR 0011) still works between two tag writes.
5. Each open Pantin has its own step counter; simulated time is steps × 1/120
   s, never wall-clock time. A scheduler turns elapsed monotonic time into a
   whole number of steps and runs them on every open Pantin. After a stall it
   catches up at most 12 steps (100 ms) per tick and drops the rest, so a
   paused process does not freeze the core while it replays seconds of steps.
6. The clock and the timer are injected into the server. Tests drive them by
   hand, so every test is deterministic.
7. Setpoints are runtime state like joint positions: never saved, cleared on
   discard and when the joint is deleted.

## Rejected alternatives

- Declaring tags in `pantin.json` now: a schema change with nothing to fill
  it yet but joints; the I/O list (phase 7) and drives (phase 4) will decide
  how tags are declared.
- Applying the last setpoint on every step: a client that previews a joint
  with `PUT .../position` would see it jump back at the next step.
- A step driven by the HTTP request rate or by `setInterval` counts: both
  depend on the machine's load, not on simulated time.

## Consequences

- An axis can be driven by writing a tag through REST, with no viewer.
- Phase 4 replaces the "go straight to setpoint" rule by the drive modes,
  keeping the tag names.
- The tag bus over WebSocket (CLAUDE.md section 9) reuses the same tag
  descriptions; REST stays for tests and tools.
- NOT VERIFIED: timer jitter of Node's `setInterval` at 8.3 ms under load.
  It does not affect determinism (steps are counted, not timed) but may show
  as uneven motion in the viewer.
