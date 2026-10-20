# Viewer on the tag bus

Phase: PLC bridge follow-up, serves phase 8. ADR: 0045 points 2 and 4, 0015, 0046.

## Why

The viewer polls tags four times a second (sensor markers, presence beams,
drive and inspector values). A cell crossed by a fast product can switch on
and off between two polls and never show; the tag bus is meant to push them.

CLAUDE.md section 9 plans the snapshot of the bodies and the fault and scene
events on the tag bus. Only the bridge uses it today; the viewer stays on REST
and SSE (ADR 0015). The shared schemas wait for a consumer before a JSON
Schema export (ADR 0045 point 2).

## What

Move the viewer's state stream (poses, tag values, events) to the bus, then
export the bus JSON Schema, then drop the polling. Diagnostics (ADR 0031
point 4) go on the bus with it.
Needs its own ADR (security of a second consumer, ADR 0046).
