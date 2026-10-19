# Push tag values to the viewer instead of polling

Phase: 8 / PLC bridge. ADR: 0024 points 4 and 5, 0045 point 4, CLAUDE.md 9.

## Why

The viewer polls tags four times a second (sensor markers, presence beams,
drive and inspector values). A cell crossed by a fast product can switch on
and off between two polls and never show. The viewer stays on REST and SSE
(ADR 0045 point 4); the tag bus is meant to push tags.

## What

Push tag changes (and later body snapshots and events) to the viewer on the
tag bus, then drop the polling. Same item as `viewer-on-tag-bus.md`, which
holds the bus side.
