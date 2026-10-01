# 0032. Simulation clock control: pause, step and achieved ratio

- Status: accepted
- Date: 2026-10-01
- Extends: ADR 0012 (fixed-step loop, points 5 and 6), ADR 0015 (pose stream)
- Amends: ADR 0015 (point 3: sending while paused; point 7: the stream also
  carries the clock state)

## Context

ADR 0012 already separates simulated time from wall-clock time: each open
Pantin counts its steps, simulated time is steps × 1/120 s (ADR 0005), and a
scheduler turns elapsed monotonic time into a whole number of steps, catching
up at most 12 steps (100 ms) per tick and dropping the rest. Clock and timer
are injected, so tests drive them by hand.

What is missing is control over that clock. Tuning drives (ADR 0022) and
stateful switches (ADR 0025, 0026) needs to freeze the machine, advance it
one step at a time and see the result in the viewer. Separately, the steps
dropped by the scheduler under load make simulated time fall behind wall
time silently; once a PLC is connected (phase 7), a timeout on the PLC side
could come from that and not from the program, and nothing shows it today.

A wider proposal (simulation speed, as-fast-as-possible runs, record and
replay) was reviewed on 2026-10-01. Its premise holds: time is a primitive
of the core, the viewer only commands it. Two of its points do not:

- A PLC keeps its own time. CODESYS standard timers (TON) read the runtime
  clock; a speed other than 1x, or a pause, makes PLC timeouts inconsistent
  with the simulated machine as soon as a PLC is in the loop.
- Its 1 ms step contradicts ADR 0005 (1/120 s, 1/240 s already rejected).

The user approved on 2026-10-01 to introduce clock control now and to let
the other modes extend it later.

Facts checked in the code on 2026-10-01:

- The scheduler keeps one time reference for the whole core (`lastTime`,
  `carriedSeconds` in `simulation-loop.ts`), and every loaded Pantin
  advances by the same number of steps per tick (`runSimulationSteps` in
  `simulation.ts`). Steps beyond the 12-step catch-up are dropped for the
  whole core (`fixed-step.ts`).
- Since ADR 0031, a step that throws is skipped and logged, and the rest of
  that Pantin's tick is skipped too: the only per-Pantin difference in steps
  executed today.
- The pose stream decides to send in `notifyStream`
  (`pose-stream-registry.ts`), called after every tick; its period check
  compares step counts, so nothing is sent while the step count stands
  still.
- The core never closes a Pantin: closing it in the viewer and opening it
  again finds the same runtime state in memory.

## Decision

### Core

1. **Clock state per Pantin.** Each open Pantin has a clock state: `running`
   (boolean), its step count (ADR 0012 point 5) and the step duration. It is
   runtime state, never saved. A Pantin loaded by the core starts running,
   as today. Opening a Pantin in the viewer resumes it (point 10): a pause
   never survives closing and opening it again. "Discard" (ADR 0012
   point 7) resets the runtime state but leaves `running` and the step
   count as they are.
2. **Pause.** A paused Pantin is skipped by the scheduler: its step count
   does not move. On resume it receives the steps of the next tick like the
   others; the time spent paused is never caught up, which the shared
   scheduler gives by construction.
3. **Step.** While paused, a request runs exactly `n` steps at once, `n` an
   integer from 1 to 1200 (10 s of simulated time, enough to cross a cylinder
   stroke). Refused with `conflict` while running. The steps are the same
   function as the scheduler's: pausing then stepping `n` gives a state
   bit-identical to running `n` steps with the same inputs. A step that
   throws stops the request there (ADR 0031: logged as `step_error`); the
   answer is still the clock state, whose `step` shows how many steps were
   run. The request runs synchronously: while it runs, the core answers no
   other request and the scheduler does not tick, so the other running
   Pantins lose the steps beyond the 12-step catch-up, counted in their
   `droppedSteps` (point 5).
4. **Edits and tag writes while paused.** Unchanged rules: a direct joint
   position (ADR 0011) applies at once; a command tag write is queued and
   consumed by the next step (ADR 0012 point 3); sensors are evaluated at
   each step (ADR 0025 point 1), so a switch reflects an edit made while
   paused only after the next step.
5. **Achieved ratio.** While running, the core counts, per Pantin, the steps
   executed and the steps due over a sliding window of 1 s of monotonic
   time. Steps due come from the shared scheduler, so a stall lowers the
   ratio of every running Pantin alike; a Pantin's own failing steps lower
   only its own. The ratio executed / due and the total of dropped steps
   since the Pantin was loaded are part of the clock state. Paused time is
   outside the window. The ratio is `null` until the window has been filled
   once.
6. **Console.** Pausing and resuming write an `info` entry to the Pantin
   console (ADR 0031): `clock_paused`, `clock_resumed`. A step request
   writes nothing, since the user sees its result at once.

### Protocol and API

7. `SimulationClockState` (protocol): `running`, `step` (integer),
   `stepSeconds` (1/120), `achievedRatio` (number or `null`), `droppedSteps`
   (integer). Simulated time is never sent as a float: clients compute
   `step × stepSeconds` for display only.
8. Routes, writes on REST as in ADR 0015 point 6:
   - `GET /api/pantins/:pantinId/clock` returns the state;
   - `PUT /api/pantins/:pantinId/clock` with `{ running }` pauses or resumes
     and returns the state; setting the current value is accepted (idempotent);
   - `POST /api/pantins/:pantinId/clock/step` with `{ steps }` returns the
     state after the steps.
9. **Pose stream** (amends ADR 0015):
   - a second event name, `clock`, carries one `SimulationClockState`; it is
     sent when the stream opens, on every change of `running`, after a step
     request, and once per second of wall time while running (an idle
     machine sends no pose, so the viewer's time would freeze otherwise);
   - while paused, a pose snapshot is sent after a scheduler tick when the
     poses or joint positions changed, at most every 1/30 s of wall time
     (ADR 0015 point 3 counts simulated time, which does not pass while
     paused, so an edit would never be sent).

### Viewer

10. A transport bar at the top of the central area, the same in the three
    layouts of ADR 0030 point 7 (the left-hand toolbar has no room left):
    run/pause, one step, ten steps; the step buttons are disabled while
    running. It shows simulated time in seconds with milliseconds and the
    step count, from the latest `step` received in a `pose` or `clock`
    event. The viewer never reads its own clock to advance simulated time
    (CLAUDE.md section 3.2). Opening a Pantin sends `PUT .../clock` with
    `{ running: true }` (point 1).
11. When `achievedRatio` is below 0.98, or `droppedSteps` grew since the
    previous `clock` event, the bar shows a warning ("the simulation falls
    behind real time") with the ratio; the tooltip says why it matters once
    a PLC is connected.
12. The bar's state is a pure model (state in, events in, view state out),
    tested without Babylon.js, like the other viewer models. Labels go in
    the typed message catalogue, English and French (ADR 0016 point 3), as
    do the two console codes of point 6.

### Out of scope, to docs/backlog/simulation-clock-modes.md

13. As-fast-as-possible runs for the CLI and CI scenario tests (phase 9),
    record and replay of command tag writes keyed by step number (after
    phase 7), and a speed factor, allowed only when no bridge is connected.
    The backlog note keeps the reason: a PLC in the loop only makes sense
    at 1x.

## Rejected alternatives

- A speed factor now: no need before the PLC bridge, and it suggests that a
  PLC program can be validated faster than real time, which is false with a
  PLC in the loop.
- One clock for all open Pantins: the step count is already per Pantin
  (ADR 0012 point 5) and a simulated machine is an isolated instance
  (CLAUDE.md section 1).
- `step(deltaTime)` with a free duration: breaks the fixed step and
  determinism (ADR 0005).
- Catching up the paused time on resume: a burst of steps the user did not
  ask for, capped at 12 but still a jump.
- Clock state through polling `GET /clock` from the viewer: a request per
  frame and a cadence tied to the browser (same reason as ADR 0015).
- Starting a Pantin paused: changes today's behaviour for every user; can be
  revisited with the welcome window (ADR 0027) if needed.
- A pause that survives closing and opening the Pantin in the viewer: the
  user decided on 2026-10-01 that opening resumes; a machine found frozen on
  opening, with no visible reason, is worse than one that moves.
- Running a step request in slices between scheduler ticks: keeps the core
  responsive but makes the request asynchronous and its result depend on
  the ticks in between; not needed while the limit stays at 1200.

## Consequences

- Tests: with the manual clock, a paused Pantin keeps its step count while
  time advances; resume runs no catch-up; `n` steps while paused equal `n`
  running steps bit for bit (joints, drives, sensor states); step while
  running is refused; a step that throws stops the request and the answer
  shows the steps run; the ratio drops when the injected timer stalls;
  opening in the viewer resumes a paused Pantin; discard keeps the clock.
- The pose stream has two event names; ADR 0015 gets "Amended by: ADR 0032".
- The console gains two codes (ADR 0031 point 3).
- The tag bus (CLAUDE.md section 9) will carry the same `SimulationClockState`
  when it replaces the stream.
- NOT VERIFIED: the cost of running 1200 steps in one request on a large
  scene (500 bodies at 5.1 ms per physics step would block the whole core
  about 6 s, spike 0002); the limit may need to depend on the scene once
  phase 6 adds products.
