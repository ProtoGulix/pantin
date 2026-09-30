# 0025. Realistic joint switches: hysteresis and one folder per technology

- Status: accepted
- Date: 2026-09-30
- Amends: ADR 0023 (point 4: sensors become stateful; point 2: new types)
- Research: docs/spikes/0006-real-sensor-characteristics.md

## Context

ADR 0023 models an end-of-stroke switch as an ideal range of the joint
coordinate, with no memory. The user, an automation engineer, found this too
far from real sensors. Spike 0006 shows that every switching technology has a
hysteresis, and that each one is specified by its own datasheet parameters:
a mechanical limit switch by its operating point, differential travel and
overtravel, a cylinder sensor by its window along the stroke, an inductive
sensor by its sensing distance and the target's material. The user approved
the model below on 2026-09-30.

## Decision

1. **Sensors have state.** A sensor type's evaluation takes the joint
   position and the sensor's previous state, and returns its tag values and
   its new state. The core evaluates every sensor at each simulation step,
   after the joints moved, and keeps the state as runtime state, never
   saved. A sensor never stepped yet (just opened or edited) is evaluated
   from its position alone.
2. **Switch zones.** Each switch type describes, in a `zone.ts` of its
   folder, the zone of the joint coordinate where it turns on, the wider
   zone where it stays on once on (the hysteresis), and the zone to draw.
   One shared evaluation turns these zones into the switch state; a type
   only translates its datasheet parameters into zones. Zones are data about
   geometry: the viewer may read them to draw the markers (ADR 0024), never
   the evaluations.
3. **Switch types**, all with a `state` bit and a normally-closed option:

   | Type | Parameters (joint coordinate unit unless stated) | On zone | Stays on until |
   | --- | --- | --- | --- |
   | `position_switch` ("ideal switch") | range | the range | it leaves the range |
   | `limit_switch` (mechanical) | operating position, actuation direction, differential travel, overtravel | past the operating position | it comes back past it by the differential travel |
   | `cylinder_switch` (magnetic, in the slot) | window centre, window width, hysteresis | inside the window | it leaves the window by more than the hysteresis |
   | `inductive_switch` (axial approach) | face position, approach direction, nominal distance Sn, target material, hysteresis % | gap to the face ≤ Sn × material factor | the gap exceeds that distance by the hysteresis % |

   Material factors (spike 0006): steel 1, stainless steel 0.7, brass 0.4,
   aluminium 0.35, copper 0.3. A limit switch pushed past its overtravel
   stays on; the overtravel is drawn so that the user sees the margin.
4. **New parameter kinds** for the forms: a position or a length along the
   joint coordinate (`coordinate`), a percentage (`percent`), and a choice
   among fixed values (`choice`, whose option labels live in `labels.ts`).
5. **Not simulated:** switching delays and contact bounce, shorter than a
   simulation step (8.3 ms) and filtered by the PLC input (3 ms on a WAGO
   750-430); the spread between Sr and Sn; temperature drift.
6. "Add end-of-stroke switches" creates two mechanical limit switches, each
   operated 2 % of the stroke before its end with an overtravel of 2 % and a
   differential travel of a quarter of that.
7. Schema version 7 accepts the new types; the migration changes nothing.

## Rejected alternatives

- Geometric sensors now (a detection cone on a body, detecting a target
  body): needed for products and for targets not moved by the watched joint,
  so it belongs with the presence sensors of phase 6, which will reuse the
  inductive parameters.
- Hysteresis as a flag of the ideal switch only: it would not carry the
  datasheet parameters the user asked for.
- Simulating bounce: invisible at 120 steps per second, and filtered by the
  PLC; it may come back as an injectable "worn switch" fault.

## Consequences

- The core keeps one more runtime map (sensor states), cleared like the
  drive states when a Pantin is opened or a sensor edited.
- Tag values of sensors come from the last step, like drive feedback.
- Any edit of a sensor (a rename included) forgets its state: a switch held
  inside its hysteresis band starts released at the next step.
- A community sensor type that switches only writes a `zone.ts`; one that
  does something else (the encoder) writes its own evaluation.
