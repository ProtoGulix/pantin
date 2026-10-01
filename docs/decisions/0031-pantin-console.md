# 0031. The Pantin console, and forced tags written by the PLC

- Status: accepted
- Date: 2026-10-01
- Depends on: ADR 0028 (diagnostics), ADR 0030 (forcing in the diagram)
- Amends: ADR 0028 (point 5: where diagnostics are shown)

## Context

ADR 0030 makes forcing a command tag a single click in the diagram. From
phase 7 the PLC writes the same command tags. Nothing says what happens
when both write one tag; the review of ADR 0030 raised it on 2026-10-01.
The user decided the same day that it is an error, reported in a Pantin
console, and asked for the console now.

Other events have no place to be reported either: ADR 0028 diagnostics
(`conflicting_commands`) are shown on the drive only while they last, and
an injected fault, a migration on opening or an error in the simulation
step leaves no trace the user can read back.

The viewer already shows short notifications of its own actions at the
bottom of the left column ("Pantin « test2 » enregistré"). They stay; the
console is for what happens in the core.

The tag bus that will carry events does not exist yet (`tag-routes.ts`
reads tags through REST meanwhile).

## Decision

1. **A console per open Pantin.** The core keeps, for each open Pantin, the
   last 1000 console entries in memory, numbered by a sequence that only
   grows. Entries are runtime state: never saved, gone when the Pantin is
   closed or the core restarts.
2. **An entry** has: its sequence number, wall clock time, simulation time,
   a level (`error`, `warning`, `info`), a stable code, its source (the
   Pantin, or a drive, actuator, sensor or joint by id) and the parameters
   of its message. The core sends no text: the viewer builds the message
   from the code and parameters with the translation files (ADR 0010). The
   entry schema is a Zod schema in the protocol.
3. **First codes.**

   | Code | Level | When |
   | --- | --- | --- |
   | `forced_tag_written` | error | the PLC writes a forced tag (point 6) |
   | `step_error` | error | the simulation step throws; the step is skipped |
   | `diagnostic_raised` | warning | a drive raises a diagnostic (ADR 0028 point 5) |
   | `diagnostic_cleared` | info | that diagnostic clears |
   | `fault_set`, `fault_cleared` | info | `unresponsive` or `jammed` changes |
   | `migrated` | info | the document was migrated on opening, from and to which versions |

   Entries are written on changes, never at every step. When an entry would
   repeat the previous one (same code, source and parameters), the core
   increments a count on it instead, so a fault that flickers at 120 Hz
   cannot flood the console.
4. **Reading.** Until the tag bus exists, the viewer reads new entries
   (those after the last sequence it has) through a REST route next to the
   tag read, in the 250 ms loop of ADR 0029 point 8. Once the tag bus
   exists, the core also sends each entry on it, and diagnostics with them
   (amends ADR 0028 point 5).
5. **In the viewer.** The console is a panel at the bottom of the central
   area, under the 3D view and the diagram, closed by default, with its own
   splitter. It opens from the "Affichage" menu, a keyboard shortcut, or a
   counter of errors and warnings in the toolbar that shows even when the
   console is closed; the console never opens by itself. Each line shows
   time, level, source and message, newest at the bottom, with filters by
   level; clicking a line, or Enter on it, selects its source (ADR 0030
   point 1). "Effacer" hides the lines read so far, in this viewer only;
   the core keeps its buffer.
6. **Forced tags, built with phase 7.** A tag written by a client (the
   viewer, through a socket or the inspector) becomes forced: it keeps the
   forced value until a client releases it. A write by the PLC to a forced
   tag is ignored and logged as `forced_tag_written`, with the tag, the
   forced value and the value the PLC wrote; repeated PLC writes fold into
   that entry's count (point 3). A forced socket and a forced tag in the
   inspector carry a mark; the inspector releases one tag, and the index
   releases all of them. Before phase 7 no PLC writes, so this error cannot
   occur; the console and the other codes are built now.

## Rejected alternatives

- The PLC's write winning over the forced value: the user forces to test
  against the program, and a value the PLC overwrites at its next cycle
  cannot be tested.
- Refusing to force while a PLC is connected: forcing is how a program is
  tested on a running cell.
- A warning instead of an error: the decision of the user; a forced tag
  hides from the program what it commands, which a commissioning engineer
  must not miss.
- Sending translated text from the core: the viewer's language would not
  apply, against ADR 0010.
- Using the server log as the console: written for developers, in English,
  not per Pantin, and not reachable from the viewer.
- Opening the console on each error: it would push the 3D view and the
  diagram around during a test; the counter shows that something happened.

## Consequences

- The protocol gains the console entry schema; the core gains the buffer,
  the folding of repeats and a read route; the viewer gains the panel, the
  counter and the translations of each code.
- `step_error` changes how the core handles a throwing step: the step is
  skipped and logged instead of stopping the loop. To check against the
  current loop before building.
- Phase 7 must keep the source of each tag write (client or PLC), which
  point 6 needs.
- Backlog: export of the console as text, codes for sensors (a sensor
  changing state, as a trace for the PLC program), entries kept across a
  restart of the core.
