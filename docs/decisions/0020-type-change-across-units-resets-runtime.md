# 0020. A type change across coordinate units resets the joint's runtime state

- Status: accepted
- Date: 2026-09-29
- Extends: ADR 0018 (type change keeps the id)

## Context

ADR 0018 point 2 clamps the position to the new limits when a joint changes
type and stays movable. A joint's coordinate is in metres for a slider and
in radians for a pivot (JOINT_COORDINATE_UNITS). Kept across such a change,
a position of 0.5 m becomes 0.5 rad (about 29°), and a queued setpoint in
metres is applied as radians at the next step; a continuous joint is not
even clamped. The part would move where the user never asked, which
ADR 0018 rejects for default parameters. Found by the review of the
ADR 0018 implementation. The user approved this decision on 2026-09-29.

## Decision

1. When a joint's type changes and its coordinate unit changes with it
   (JOINT_COORDINATE_UNITS of the old and new types differ), the core
   forgets its position, its setpoint and its queued setpoint, as when the
   joint is deleted: the joint starts again from 0, clamped by its limits
   (ADR 0011 point 5).
2. When the unit stays the same (slider to helical, revolute to
   continuous), ADR 0018 point 2 applies unchanged: the position is clamped
   to the new limits.

## Rejected alternatives

- Converting the value between units: there is no meaningful conversion
  from a length to an angle.
- Always resetting on any type change: throws away a position that still
  means the same thing (revolute to continuous).

## Consequences

- The core needs the old type when it applies an update.
- A PLC writing setpoints (phase 7) loses a pending write when the joint
  changes unit; nothing consumes tags yet.
