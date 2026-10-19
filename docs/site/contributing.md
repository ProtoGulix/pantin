# Pour les contributeurs

Ce guide s'adresse aux utilisateurs. Les décisions de conception, les rapports de vérification et l'historique des versions vivent dans le dépôt, en anglais ou en français selon le document.

- **Décisions d'architecture** : un court texte par décision, avec l'alternative écartée. Dossier [`docs/decisions`](https://github.com/ProtoGulix/pantin/tree/develop/docs/decisions).
- **Rapports de vérification** : les essais faits avant de retenir une technique. Dossier [`docs/spikes`](https://github.com/ProtoGulix/pantin/tree/develop/docs/spikes).
- **Historique des versions** : le [`CHANGELOG.md`](https://github.com/ProtoGulix/pantin/blob/develop/CHANGELOG.md).

## Les décisions qui touchent le plus l'utilisateur

| Sujet | Décision |
| --- | --- |
| Assemblages importés depuis un STEP | [0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md) |
| Assemblages et groupes rigides | [0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md) |
| Aligner le repère d'un groupe sur son axe | [0056](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0056-reorient-a-group-frame.md) |
| Axe d'une liaison pris sur une face | [0041](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0041-joint-axis-from-a-picked-face.md) |
| Exposition réseau et sécurité | [0004](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md) |
| Liste d'E/S unique (`io.json`) | [0049](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0049-one-io-json-edited-from-the-viewer.md) |
| Pont automate, tag bus, esclave Modbus | [0045](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md), [0048](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0048-hand-written-modbus-tcp-slave.md), [0050](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0050-bridge-started-from-the-viewer.md) |
| Couleurs et repères pour les daltoniens | [0057](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0057-colour-blind-safe-coding.md), avec le [rapport 0010](https://github.com/ProtoGulix/pantin/blob/develop/docs/spikes/0010-isa-101-hmi-colour.md) |
| La console | [0031](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0031-pantin-console.md) |
