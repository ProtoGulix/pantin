# Pantin

**FR** : simulateur open source de machines industrielles, piloté en boucle
fermée par un vrai programme d'automate. Vous importez vos modèles 3D (STL,
STEP, glTF), vous les animez avec des liaisons, des préactionneurs, des
actionneurs et des capteurs, et un automate (CODESYS, en Modbus TCP) les pilote
avant la mise en service.

**EN**: an open source industrial machine simulator, driven in closed loop by
a real PLC program. Import your 3D models (STL, STEP, glTF), animate them with
joints, drives, actuators and sensors, and let a PLC (CODESYS, over Modbus TCP)
drive them before commissioning.

## Documentation

- Guide utilisateur (français) : [docs/site/guide](docs/site/guide/fundamentals.md)
- User guide (English): [docs/site/en/guide](docs/site/en/guide/fundamentals.md)
- Contributors: [CLAUDE.md](CLAUDE.md), [docs/](docs/README.md) (decisions,
  spikes, guides to add a type)

## Quick start

    pnpm install
    pnpm setup:python
    pnpm serve

`pnpm docs:dev` serves the user guide locally.

## Licence

Apache 2.0, see [LICENSE](LICENSE).
