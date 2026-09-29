# 0015. Pose stream over Server-Sent Events

- Status: accepted
- Date: 2026-09-29

## Context

The viewer must show bodies moving (phase 3). CLAUDE.md section 3.2 wants
the core to push its state at 30 to 60 Hz and the viewer to interpolate. The
core computes poses (ADR 0011) and steps at 1/120 s (ADR 0012); the viewer
only reads them. Node has no WebSocket server built in: one would need a new
dependency (`ws`). The user approved Server-Sent Events on 2026-09-29.

## Decision

1. `GET /api/pantins/:pantinId/pose/stream` answers `text/event-stream`. The
   Pantin is opened as by any other route; an unknown Pantin answers the
   usual JSON error before the stream starts.
2. Each event is named `pose`; its data is one `PoseSnapshot` (protocol):
   the step count, the joint positions and the pose of every body, as in
   `PoseResponse`.
3. The core sends a snapshot when the stream opens, then after a simulation
   tick when at least 1/30 s of simulated time has passed since the last one
   sent and the poses or joint positions changed. Edits outside the loop
   (a joint created, a direct position) are therefore sent by the next tick.
   An idle machine sends nothing.
4. A comment line (`: keep-alive`) every 15 s keeps proxies from closing an
   idle stream (Cloudflare closes idle connections after about 100 s,
   NOT VERIFIED on this account).
5. At most 16 streams are open at once in one core; the next one answers
   `conflict` with a message asking to close a viewer tab. Closing the
   connection releases its slot.
6. The viewer validates every snapshot with the protocol schema and
   interpolates between the two latest snapshots (translation linearly,
   rotation by spherical interpolation) over 1/30 s. Writes (positions, tags,
   edits) stay on REST.
7. The tag bus (CLAUDE.md section 9) remains to be specified; this stream
   carries poses only.

## Rejected alternatives

- WebSocket now: a new dependency for a one-way flow; it comes back with the
  tag bus, which is two-way.
- Polling `GET /pose` from the viewer: a request per frame per viewer, and a
  cadence tied to the browser, not to simulated time.
- A snapshot after every step (120 Hz): four times the traffic for no visible
  gain once the viewer interpolates.

## Consequences

- No new dependency on either side (`EventSource` in the browser).
- Behind nginx, the stream needs `proxy_buffering off` (ADR 0014 site).
- The viewer lags the core by up to one snapshot period (33 ms) because of
  the interpolation.
