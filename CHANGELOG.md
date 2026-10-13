# Changelog

All notable changes to Pantin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[SemVer](https://semver.org/). Branches and releases: ADR 0044.

## Unreleased

### Added

- Phase 6, in progress (ADR 0043): schema version 12 with belts, guides,
  emitters, absorbers and presence sensors; the Rapier physics engine in the
  core; products carried by belts driven through the drive, motor and drum
  chain; photoelectric presence sensors; the automated phase 6 exit test.
- Phase 6 HTTP API (ADR 0043 point 12): create, replace and delete routes for
  `belts`, `guides`, `emitters`, `absorbers` and `presence-sensors`, with
  conflicts that name the bodies and drum joints in use; `POST .../reset`,
  which clears products, commands and faults but keeps unsaved edits, the
  clock and the step count; and `products` in the pose response and the pose
  stream, so that a product moving on a stopped machine is sent.
- `objects` in the pose response and the pose stream: the world pose of every
  belt, guide, emitter, absorber and presence sensor, resolved by the core with
  the frame rule of its physics step, so the viewer draws them where the
  colliders and rays are.
- Viewer, phase 6 drawing (ADR 0043 point 13): products as boxes coloured by
  material, belts with a travel arrow, outlined guides, emitters and absorbers,
  and presence sensor beams lit by their `state` tag.
- Viewer, phase 6 editing (ADR 0043 point 13): create, edit and delete belts,
  guides, emitters, absorbers and photoelectric presence sensors from the
  inspector (placement in mm and degrees, sizes in mm, mass in kg, delays in
  ms, body picker limited to the assembly); a click in the 3D view selects
  them, nearest hit first; an emitter's "Créer un produit" button pulses its
  `spawn` tag; "Remise à zéro" in the transport bar and the Edit menu calls the
  reset route. French and English labels.
- Joint axis from a picked face (ADR 0041) and the assembly frame trihedron
  with a local or global gizmo (ADR 0042).
- One inspector for properties and positioning (ADR 0039) and nested
  assemblies following the STEP tree (ADR 0040).
- A phase 6 object without `body` is placed in the frame of its assembly as
  posed, the static frame moved by the joints that anchor the assembly (the
  ADR 0042 trihedron frame), in the physics step and in the pose response: a
  belt or guide on a conveyor module carried by a lift rides with it (ADR 0043
  point 1).

### Fixed

- Viewer: STL bodies (binary and ASCII) now display. The mesh bytes were given
  to Babylon 9.28 as a raw buffer, which its STL plugin rejects ("Plugin does
  not support loading ArrayBufferView"); they are now given as a `File`. A body
  whose mesh fails to load reports the error once instead of being retried at
  every redraw.
- The CI workflow now runs on pushes to `develop` and `master`; it watched a
  `main` branch that does not exist.
