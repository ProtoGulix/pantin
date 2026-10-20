# Backlog

Ideas outside the current phase scope. One short file per idea, each with its
CLAUDE.md phase and related ADRs; they never go into the code before their
phase.

## Phase 8 — editing

- [CAD navigation extras](cad-navigation-extras.md) — touchpad preset, free rotation and roll
- [Console, diagram, welcome and placement extras](console-and-diagram-extras.md) — small follow-ups left by ADRs 0027 to 0035
- [Frame rotation extras](frame-rotation-extras.md) — other ways to give the rotation of ADR 0056
- [Share a frozen scene](frozen-scene-export.md) — one GLB export, if the need is real
- [Joint star view: extras](joint-star-extras.md) — live state, editing from the view, cross-links
- [Split a GLB body by nodes](glb-split-by-nodes.md) — several bodies from one file (on hold: needs a real GLB)
- [Multi-selection in the 3D view](multi-selection-in-3d.md) — for grouping, without breaking click-to-go-down
- [Place objects from a picked face](place-objects-from-picked-face.md) — one-click placement of belts and cells (needs a core route)

## Phase 9 — community and instances

- [Part instances and interfaces](part-instances-and-interfaces.md) — interface frames, joints between instances
- [Declarative drive types](declarative-drives.md) — data-only drives loadable without a sandbox
- [Simulation clock modes](simulation-clock-modes.md) — as-fast-as-possible runs, record and replay
- [Detect external edits of pantin.json](detect-external-pantin-edits.md) — conflict when the file changed outside
- [Bridge in server mode](server-mode-bridge.md) — docker compose with a separate bridge container
- [Desktop app, and a core without Python](desktop-app-without-python.md) — Electron study (on hold)

## Conveying and physics (after phase 6)

- [Conveyors beyond the straight belt](conveyor-shapes-beyond-straight-belts.md) — curves, rollers, belt transfers
- [Colliders from machine meshes](mesh-colliders.md) — pushers and grippers touching products
- [Guides on moving frames](objects-on-moving-frames.md) — colliders carried by a moving frame, not verified
- [Friction per material](per-material-friction.md) — table by material pair
- [Pose stream load from resting products](product-stream-load.md) — sleeping bodies or coarser rounding
- [Inductive presence sensor](inductive-presence-sensor.md) — sees metals only
- [Presence rays that see the background](ray-background-detection.md) — diffuse cell option

## PLC bridge (after phase 7)

- [Bridge reconnection](bridge-reconnection.md) — swap slaves on `io_changed` without a restart
- [PLC bridge extras](plc-bridge-extras.md) — feedback forcing, scaled INT, fail-safe values, aliases
- [OPC UA](opc-ua.md) — second protocol, its own ADR
- [Viewer on the tag bus](viewer-on-tag-bus.md) — bodies, tags and events pushed, no more polling

## Spikes and checks

- [Spike 4b: CODESYS in a VM](spike-4b-codesys-vm.md) — latency, NAT vs bridged IPs, ports
- [Spike 5b: export from the user's CAD](spike-5b-user-cad-export.md) — on hold: needs a file from that CAD
- [Trademark check for the name](name-trademark-check.md) — INPI and EUIPO, by hand

## Debt and tooling

- [Cost of adding a primitive kind](primitive-kind-cost.md) — registry per kind before rollers
- [Environment lighting](environment-lighting.md) — on hold, with metallic CAD colours

## Security

- [Check the Cloudflare Access token at the origin](access-token-at-origin.md) — before any shared exposure
- [Inline theme script and a future CSP](viewer-inline-theme-script-csp.md) — allow it by hash
