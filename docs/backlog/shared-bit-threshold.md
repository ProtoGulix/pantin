# One shared threshold for a bit tag read as on

Phase: debt. ADR: 0047 P2.

The viewer reads a bit tag as on from 0.5, and writes that threshold in five
places: `tree/device-state.ts`, `conveyors/beam-appearance.ts`,
`scene/sensor-markers.ts`, `ui/inspector-live.ts` and
`diagram/diagram-live.ts` (found in the review of ADR 0047 P2). One exported
constant would keep them from drifting apart.
