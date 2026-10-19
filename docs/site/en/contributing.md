# For contributors

This guide is written for users. The design decisions, the verification reports and the version history live in the repository.

- **Architecture decisions**: a short text per decision, with the alternative that was rejected. Folder [`docs/decisions`](https://github.com/ProtoGulix/pantin/tree/develop/docs/decisions).
- **Verification reports**: the trials made before a technique was chosen. Folder [`docs/spikes`](https://github.com/ProtoGulix/pantin/tree/develop/docs/spikes).
- **Version history**: the [`CHANGELOG.md`](https://github.com/ProtoGulix/pantin/blob/develop/CHANGELOG.md).

## The decisions users meet most

| Topic | Decision |
| --- | --- |
| Assemblies imported from a STEP | [0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md) |
| Assemblies and rigid groups | [0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md) |
| Aligning the frame of a group on its axis | [0056](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0056-reorient-a-group-frame.md) |
| Joint axis taken from a face | [0041](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0041-joint-axis-from-a-picked-face.md) |
| Network exposure and security | [0004](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md) |
| The single I/O list (`io.json`) | [0049](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0049-one-io-json-edited-from-the-viewer.md) |
| PLC bridge, tag bus, Modbus slave | [0045](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md), [0048](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0048-hand-written-modbus-tcp-slave.md), [0050](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0050-bridge-started-from-the-viewer.md) |
| Colours and cues for colour-blind users | [0057](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0057-colour-blind-safe-coding.md), with [report 0010](https://github.com/ProtoGulix/pantin/blob/develop/docs/spikes/0010-isa-101-hmi-colour.md) |
| The console | [0031](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0031-pantin-console.md) |
