# 0023. Joint sensors, and one folder per sensor type

- Status: accepted
- Date: 2026-09-30
- Extends: ADR 0022 (drives and drive type folders), ADR 0019 (tag keys)

## Context

Phase 5 (CLAUDE.md section 13.5) adds joint sensors, with no physics: a
detector of a joint's position range (an end-of-stroke switch) and a pulse
encoder (CLAUDE.md section 5.4.1). It ends when end-of-stroke switches flip
at the right positions. Without them a PLC program commands a cylinder but
cannot see it arrive.

The user asked on 2026-09-30, as for drives, that sensor types be
community-minded: one folder per type, so that a type can be shared,
maintained and improved without touching the rest of the code (CLAUDE.md
sections 2.5 and 3.3). ADR 0022 already does this for drives.

Choices made by default, to be revisited if the user asks:

- A package of its own, `@pantin/sensor-types`, rather than one package for
  drives and sensors: each stays short and reads alone.
- The encoder count wraps like a CODESYS DINT (32-bit signed), which is what
  a PLC counter input shows.
- No switching delay yet: CLAUDE.md asks for one on presence sensors
  (phase 6). A delayed switch would be a new sensor type, with state.

Facts checked in the repository on 2026-09-30:

- The `integer` tag type exists in the protocol (tag.ts); no tag uses it yet.
- Tag prefixes are unique per assembly among joints and drives
  (pantin-assemblies.ts, core/domain/tag-keys.ts).
- A driven joint cannot be deleted; an assembly holding a drive cannot
  either (ADR 0022 point 4, joint-rules.ts, assembly-edits.ts).

## Decision

1. A package `@pantin/sensor-types` holds one folder per sensor type:
   `schema.ts` (its fields, parameters and tags as data), `evaluate.ts` (a
   pure function from the joint's position to the tag values) and
   `labels.ts` (English and French, typed after the schema). Registries
   `schemas.ts`, `evaluators.ts` and `labels.ts` list the folders. The same
   dependency rules as drive types apply: the protocol imports the schemas
   only, the core the evaluators, the viewer the schemas and the labels.
   Adding a type is described in docs/guides/adding-a-sensor-type.md.
2. First sensor types:

   | Type | Parameters | Tag |
   | --- | --- | --- |
   | `position_switch` | the range where it is on, in the joint's unit; normally closed or not | `state` (bit, feedback) |
   | `encoder` | pulses per unit of the joint's coordinate | `count` (integer, feedback) |

   The position switch is on when the joint is within its range, off
   outside; a normally closed switch reads the other way. The encoder counts
   the joint's position from its reference, rounded, wrapped to a 32-bit
   signed integer.
3. A sensor in `pantin.json` has an id, a name, an `assembly`, a `tagKey`,
   the id of the one joint it watches, and its type's fields. Its tags are
   `<assembly>.<tagKey>.<member>`, feedback only: a PLC reads them. Document
   rules: the joint exists and can move; the tag prefix is unique in its
   assembly among joints, drives and sensors.
4. A sensor has no state: its values are computed from the joint positions
   whenever tags are read, so they always match the latest step, and a
   test needs no clock.
5. A joint watched by a sensor, or an assembly holding one, cannot be
   deleted; the message names the sensor. An assembly key rename moves its
   sensors, and their tags are reported as renamed.
6. Sensors are created, changed (their type included, keeping id and tag
   key), deleted and given a new tag key through REST, like drives.
7. The viewer lists sensors in the right-hand panel with their live value,
   offers "Add a sensor…" and "Add end-of-stroke switches" (two switches at
   the ends of the stroke) in a joint's context menu, shows a joint's
   sensors in its properties, and marks a watched joint in the tree at the
   end of its row, like the drive bolt.
8. `pantin.json` goes to schema version 6; the migration adds
   `sensors: []`. The JSON Schema is regenerated.

## Rejected alternatives

- Sensors as fields of their joint: a joint often has two switches and an
  encoder; a list per joint would still need ids and tag keys for each.
- One package for drives and sensors: shorter to set up, longer to read,
  and a contributor adding a sensor would wade through drives.
- Simulating each encoder pulse: at 120 steps per second a pulse train is
  not representable; a PLC reads the counter value, which is what we give.
- A switching delay now: no phase asks for it on joint sensors; it would
  bring state to every sensor for one type's sake.

## Consequences

- The first integer tag appears; its values are whole numbers.
- A joint's context menu gains two entries; the tree gains a second marker.
- Phase 7 (PLC bridge) will read these feedback tags like any other.
