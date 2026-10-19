# Backlog

Ideas outside the current phase scope. One short file per idea, each with its
CLAUDE.md phase and related ADRs; they never go into the code before their
phase.

## Phase 8 — editing

- [Belts in the chain diagram](belts-in-chain-diagram.md) — draw the belt as the end of its chain
- [CAD navigation extras](cad-navigation-extras.md) — touchpad preset, box select, previous view, Normal To
- [Console, diagram, welcome and placement extras](console-and-diagram-extras.md) — small follow-ups left by ADRs 0027 to 0035
- [Frame rotation extras](frame-rotation-extras.md) — other ways to give the rotation of ADR 0056
- [Share a frozen scene](frozen-scene-export.md) — one GLB export, if the need is real
- [Joint star view: extras](joint-star-extras.md) — live state, sensor mark, editing from the view
- [Split a GLB body by nodes](glb-split-by-nodes.md) — several bodies from one file (on hold: needs a real GLB)
- [I/O mapping export to a spreadsheet](io-csv-export.md) — read-only CSV for electricians
- [Multi-selection in the 3D view](multi-selection-in-3d.md) — for grouping, without breaking click-to-go-down
- [Nested assemblies: extras](nested-assemblies-extras.md) — axis from geometry, metallic CAD colours
- [Place objects from a picked face](place-objects-from-picked-face.md) — one-click placement of belts and cells
- [Remove redundant fixed joints](remove-redundant-fixed-joints.md) — clean Pantins saved before groups
- [Retry a body whose mesh failed](retry-failed-body-mesh.md) — a "Réessayer" action
- [Tag key rename for emitters and presence sensors](phase-6-tag-key-rename.md) — missing PUT route
- [Interface polish](ui-polish-from-docs.md) — small defects found while documenting

## Phase 9 — community and instances

- [Part instances and interfaces](part-instances-and-interfaces.md) — interface frames, joints between instances
- [Declarative drive types](declarative-drives.md) — data-only drives loadable without a sandbox
- [Simulation clock modes](simulation-clock-modes.md) — as-fast-as-possible runs, record and replay
- [Detect external edits of pantin.json](detect-external-pantin-edits.md) — conflict when the file changed outside
- [Bridge in server mode](server-mode-bridge.md) — docker compose with a separate bridge container

## Conveying and physics (after phase 6)

- [Conveyors beyond the straight belt](conveyor-shapes-beyond-straight-belts.md) — curves, rollers, belt transfers
- [Colliders from machine meshes](mesh-colliders.md) — pushers and grippers touching products
- [Guides and belts on moving frames](objects-on-moving-frames.md) — add the frame velocity
- [Friction per material](per-material-friction.md) — table by material pair
- [Pose stream load from resting products](product-stream-load.md) — sleeping bodies or coarser rounding
- [Inductive presence sensor](inductive-presence-sensor.md) — sees metals only
- [Presence rays that see the background](ray-background-detection.md) — diffuse cell option

## PLC bridge (after phase 7)

- [Bridge reconnection](bridge-reconnection.md) — swap slaves on `io_changed` without a restart
- [PLC bridge extras](plc-bridge-extras.md) — feedback forcing, scaled INT, fail-safe values, aliases
- [OPC UA](opc-ua.md) — second protocol, its own ADR
- [Viewer on the tag bus](viewer-on-tag-bus.md) — bodies, tags and events pushed on the bus
- [Push tag values instead of polling](push-sensor-states.md) — fast sensor pulses never missed

## Spikes and checks

- [Spike 4b: CODESYS in a VM](spike-4b-codesys-vm.md) — latency, NAT vs bridged IPs, ports
- [Spike 5 report: CAD pivots](spike-5-cad-pivots-report.md) — write up the machine-v2 STEP import
- [Trademark check for the name](name-trademark-check.md) — INPI and EUIPO, by hand

## Debt and tooling

- [Cost of adding a primitive kind](primitive-kind-cost.md) — registry per kind before rollers
- [dependency-cruiser dist exclude](dependency-cruiser-dist-exclude.md) — five hidden violations
- [STEP converter robustness](converter-robustness.md) — rollback, process group, size caps
- [Retry deferred mesh deletions](retry-deferred-mesh-deletions.md) — save error contract
- [One shared bit threshold](shared-bit-threshold.md) — five copies of 0.5
- [Remove `pantin io migrate`](remove-io-migrate.md) — due now
- [Rebuild plc-cylinder with the group layout](plc-cylinder-group-layout.md) — match the tutorial
- [Environment lighting](environment-lighting.md) — on hold

## Security

- [Check the Cloudflare Access token at the origin](access-token-at-origin.md) — before any shared exposure
- [Inline theme script and a future CSP](viewer-inline-theme-script-csp.md) — allow it by hash
