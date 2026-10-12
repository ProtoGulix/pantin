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
- Joint axis from a picked face (ADR 0041) and the assembly frame trihedron
  with a local or global gizmo (ADR 0042).
- One inspector for properties and positioning (ADR 0039) and nested
  assemblies following the STEP tree (ADR 0040).

### Fixed

- The CI workflow now runs on pushes to `develop` and `master`; it watched a
  `main` branch that does not exist.
