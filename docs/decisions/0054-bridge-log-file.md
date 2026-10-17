# 0054. The bridge log: one file per Pantin, written by the core

- Status: accepted
- Date: 2026-10-17

## Context

The first test with a real CODESYS Control Win V3 (2026-10-17) failed with
nothing to show why: the PLC connected to the Modbus slave, got answers it
did not accept, stopped sending, and the bridge closed the idle connection.
The bridge answers a refused request with a Modbus exception but logs
nothing about it. The core keeps the last 20 stderr lines of the bridge in
`BridgeStatus.log` (ADR 0050), and the viewer only shows them when the bridge
has failed.

The user wants a log that is a file, can be exported, and can be read from
the viewer, from the Pantin console and from a command; and that keeps
working when another kind of bridge (OPC UA, ADR 0045) is added (user
statements, 2026-10-17).

## Decision

1. **The contract of any supervised bridge** (extends ADR 0050 point 2):
   stdout carries the JSON status lines, stderr carries the log, one UTF-8
   line per message. Nothing else is asked of a bridge: a bridge in any
   language gets a log without code in the core or the viewer. A line that
   starts with a level word as written by Python's `logging` (`DEBUG`,
   `INFO`, `WARNING`, `ERROR`, `CRITICAL`, after an optional timestamp) is
   classified; any other line is `info`.
2. **The core writes the file.** The bridge supervisor appends every stderr
   line, and its own events (start requested with listen and allow, ready
   with the modules, stop requested, stopped, failed with kind and message,
   spawn failure), to `<logs dir>/<pantinId>/bridge.log`. A core event line
   is `<ISO 8601 UTC time> CORE <LEVEL> <text>`; a bridge line is
   `<ISO 8601 UTC time> BRIDGE <the line as written>`, so the file reads in
   order whatever the bridge's own time format. Lines over 500 characters
   are cut, as in `BridgeStatus.log`.
   - `<logs dir>` is `--logs-dir`, by default `<pantins dir>/.logs`. The
     directory is not part of any Pantin and is never read as one (`.logs`
     is not a valid Pantin id). When the Pantins folder is a git repository
     the user adds `.logs/` to its `.gitignore`, as the user guide says; the
     core does not write one.
   - Rotation: when the file passes 1 MB the core renames it
     `bridge.log.1` (replacing the previous one) and starts a new file.
   - Writes are appends from one process; a failed write is reported once on
     the core's stderr and does not stop the bridge.
3. **The Modbus bridge logs what a PLC does**: a connection accepted or
   refused (source IP), a connection closed (who closed it and why, with the
   number of requests answered and refused), and every refused request:
   module, source, unit id, function code, address, quantity, exception
   code, with the expected unit id when it differs. Only the first refusal
   of each distinct (unit id, function, address, quantity, exception) is
   logged per connection, at WARNING, up to 100 distinct ones; past that one
   warning says the next are only counted. The count goes in the close line.
4. **Reading it.**
   - `GET /api/pantins/:pantinId/bridge/log` answers the current file as
     `text/plain; charset=utf-8` (empty when there is none yet), with
     `?download=1` adding `Content-Disposition: attachment;
     filename="<pantinId>-bridge.log"`. Allowed through the Cloudflare
     exposure like the other bridge routes (ADR 0050 amendment of
     2026-10-16).
   - `BridgeStatus.log` (last 20 lines, pushed on the pose stream) is
     unchanged; each pushed status is the viewer's cue to fetch the file
     again while the journal window is open.
   - The Pantin console gets the bridge's WARNING and ERROR lines as a new
     code `bridge_log`, level `warning`, source `pantin`, params
     `{ message }` (the line without its timestamp, at most 300 characters),
     folded like any repeated entry (ADR 0031). INFO lines stay in the file
     only.
   - `pnpm pantin bridge-log <pantinId> [--logs-dir <dir>] [--pantins-dir
     <dir>] [--follow]` prints the file, read directly from disk, so it
     works with the core stopped.
5. **Viewer.** A Journal button in the bridge block's header, always shown,
   opens a window with the file's end in a monospace list scrolled to the
   bottom, refreshed while open, with Copy and Download (the `download=1`
   route).

## Rejected alternatives

- The log kept in memory only (a longer `BridgeStatus.log`): lost on a core
  restart, not a file, and every status push would carry it.
- Each bridge writing its own file: every new bridge would redo the file,
  the rotation and the place, and the core events would be elsewhere.
- The log inside the Pantin folder: it would be versioned with the machine
  and change on every run.
- Every log line in the console: INFO lines would bury the warnings.
- The command going through the core's API: it would not work with the core
  stopped, which is when one reads a log after a crash.

## Consequences

- A bridge started outside Pantin (not supervised) has no file; its own
  output is its log.
- `packages/protocol` gets the `bridge_log` console code and the route in
  its bridge comment; the console schema grows, readers of older history
  are not affected (codes are only added).
- NOT VERIFIED: which requests CODESYS Control Win V3 sends for a given
  channel configuration; the log is what will show it.

## Amendment (2026-10-17): the console message drops the logger name

Point 5's console message `{ message }` is the line without its timestamp,
its level word and, when the line has Python's full layout (a timestamp
first), the logger name that follows the level (`pantin_bridge.modbus_journal: `).
The name is noise for the reader of the console; the file and the journal
window keep it (the window shows it as the message's tooltip). Without a
timestamp the text after the level is kept whole: a bridge in another
language may start its message with "Word: ".
