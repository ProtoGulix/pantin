# 0061. Console verbose mode: sensor changes as a trace

- Status: accepted (user, 2026-10-20)
- Date: 2026-10-20
- Extends: ADR 0031 (console), ADR 0032 (pause and step)
- Amends: ADR 0031 (point 1: which entry is dropped first; point 2: a
  fourth level; point 4: what the tag bus carries), ADR 0045 (point 4:
  console messages on the bus)

## Context

ADR 0031 sent "codes for sensors (a sensor changing state, as a trace for
the PLC program)" to the backlog (`docs/backlog/console-and-diagram-extras.md`).
On 2026-10-20 the user decided that sensor changes may write console lines,
but only in a verbose mode. The use case is stepping the simulation one step
at a time (ADR 0032 point 3).

Facts checked in the code on 2026-10-20:

- The console keeps the last 1000 entries per open Pantin and drops the
  oldest first (`CONSOLE_CAPACITY`, `core/src/domain/console-buffer.ts`).
  The viewer list has its own cap (`CONSOLE_CLIENT_LIMIT`,
  `viewer/src/console/console-list.ts`).
- Folding (ADR 0031 point 3) only looks back through the trailing run of
  one source. Two sensors that change in turn therefore never fold.
- `runStep` (`core/src/service/simulation.ts`) has the joint sensor outputs
  before and after each step (`openPantin.sensorOutputs`, `stepSensors`).
  Presence outputs are in `physicsState.presenceOutputs`
  (`domain/presence-step.ts`). Tag names come from `tagEntries`
  (`domain/tag-entries.ts`).
- Every console entry is sent on the tag bus (`domain/bus-feed.ts`). The
  bridge checks the level of each code against a table that a test ties to
  `protocol/fixtures/console-codes.json` (`bridge/.../bus_messages.py`),
  and it skips unknown codes, logging one line for each.
- `ConsoleSourceSchema` has no kind for a presence sensor
  (`protocol/src/console.ts`).
- The encoder's `count` is an integer tag that changes at every step while
  its joint moves (`sensor-types/src/encoder/schema.ts`).

A cell with four photoelectric sensors and one carton per second gives about
eight changes per second, interleaved across sources. That fills 1000
entries in about two minutes, and would push out a `step_error` or a
`forced_tag_written`.

## Decision

1. **The core emits trace entries only in verbose mode.** Each open Pantin
   has a runtime flag `verbose`, false by default and never saved. While it
   is false, the core writes no sensor entry at all. The viewer only filters
   what it already received.
2. **A fourth level, `trace`** (amends ADR 0031 point 2). Trace entries:
   - are not counted by the error and warning counter (ADR 0031 point 5,
     ADR 0057);
   - have their own glyph, so colour is never the only cue (ADR 0057);
   - are never sent on the tag bus (amends ADR 0031 point 4 and ADR 0045
     point 4). The PLC already has the tag values, and an older bridge would
     log one line per skipped entry.
3. **New codes** in `protocol/src/console.ts` and `console-params.ts`:

   | Code | Level | Source | Params | When |
   | --- | --- | --- | --- | --- |
   | `sensor_changed` | trace | `sensor` or `presence_sensor` | `{ tag, value }` | a bit feedback tag of a sensor changes during a step |
   | `trace_dropped` | info | `pantin` | `{ dropped }` | the trace budget of point 5 was exceeded |

   - `ConsoleSourceSchema` gains `{ kind: "presence_sensor", id }`
     (`PresenceSensorIdSchema`).
   - `tag` is the full tag name (`TagNameSchema`) and `value` is 0 or 1.
   - Only bit tags are traced. A counter such as the encoder's `count`
     would write one entry per step, against ADR 0031 point 3.
4. **Pure and after the step.** A pure function
   `sensorChangeEvents(document, before, after)` (core domain) compares
   the bit feedback tags of joint sensors and presence sensors. `runStep`
   returns its events with the others, and only when `verbose` is on. The
   simulation state does not depend on the flag.
5. **Flood protection, deterministic.**
   - Folding applies as today. One flickering sensor stays two lines.
   - Budget: at most 120 trace entries per window of 120 steps, counted in
     steps and never in wall time. The surplus is dropped, and one
     `trace_dropped` entry gives the count when the window closes.
   - Eviction (amends ADR 0031 point 1): when the buffer is full, the oldest
     `trace` entry goes first, and an older error or warning only goes when
     no trace entry is left. The viewer list follows the same rule.
6. **Route.** `PUT /api/pantins/:pantinId/console` with `{ verbose }`
   returns `{ verbose }`. Setting the current value is accepted
   (idempotent). `ConsoleResponse` gains `verbose: boolean`, so a viewer
   shows the real state when another client changed it.
7. **Pause and step.** Verbose is independent of the clock, and is allowed
   while running, under the budget of point 5. A step request still writes
   no entry of its own (ADR 0032 point 6). The steps it runs write their
   trace entries like any step. A step of 1 to 10 steps never reaches the
   budget.
8. **Viewer.**
   - A "Détaillé" / "Verbose" toggle in the console toolbar.
   - Its value is a viewer preference (`browser-storage.ts`, key
     `pantin.viewer.consoleVerbose`), sent with `PUT .../console` when a
     Pantin is opened, as the clock is (ADR 0032 point 10).
   - Turning it off also hides the trace lines already received.
   - Labels in French and English (ADR 0010).

## Rejected alternatives

- **Always emit, filter in the viewer:** it fills the shared buffer and
  evicts errors (Context). It also writes entries nobody asked for on every
  running cell.
- **Verbose saved in pantin.json:** it is a reading preference, not part of
  the machine. It would also change a public schema for no reason (CLAUDE.md
  14.6).
- **Verbose on only while paused:** a trace at 1x for a short run is also
  useful. The budget makes that safe.
- **Tracing every tag change** (commands, joints): this is what the
  inspector and the diagram already show live. Sensors were what the user
  asked for.
- **A separate trace buffer and route:** a second polling loop and a second
  sequence for the same panel. The eviction rule of point 5 is enough.
- **A wall-clock budget:** not reproducible in tests.

## Consequences

- **Protocol:** level `trace`, source `presence_sensor`, two codes, the
  `PUT` schema and `verbose` in `ConsoleResponse`. The fixture
  `console-codes.json` and the bridge's `_CONSOLE_LEVELS` gain the two codes,
  because their test compares them, even though the bus never sends `trace`.
- **Core:** `domain/console-events.ts` (or a new `domain/sensor-trace.ts`),
  `console-buffer.ts` (eviction), `service/simulation.ts`,
  `service/console-operations.ts` and its route, `bus-feed.ts` (the filter).
- **Viewer:**
  - `console/console-state.ts`, `console-list.ts`, `console-text.ts` and
    `ui/console-panel.ts`;
  - the level glyph in `theme/state-glyphs.ts`;
  - `messages.ts`.
- **Tests:**
  - `sensorChangeEvents` covers the bit tags only;
  - with verbose on or off, the joint positions, sensor outputs and tags
    are identical bit for bit after n steps;
  - with verbose off, no trace entry is written;
  - the budget and `trace_dropped` work as specified;
  - a full buffer drops a trace entry before an error;
  - the bus never sends a `trace` entry;
  - the route is idempotent;
  - the viewer model hides traces when verbose is off.
- **Docs:** troubleshooting.md (the Console paragraph), fundamentals.md ("Un
  pas de temps fixe"), FR and EN, and the CHANGELOG.
- **Backlog:** the sensor codes item of `console-and-diagram-extras.md` is
  removed.
- **NOT VERIFIED:** whether 120 entries per second of simulation is still
  readable in the viewer list. Measure it on examples/plc-cylinder.
