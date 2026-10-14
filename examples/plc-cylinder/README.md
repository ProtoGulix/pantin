# PLC cylinder

A Pantin to close the loop with a PLC over Modbus TCP (ADR 0045, ADR 0049):
a double-acting cylinder (125 mm stroke) with its carriage, fed by a 5/2
double solenoid valve with memory, and two limit switches. The assembly is
`verin1`.

## Tags

| Tag | Direction | Meaning |
| --- | --- | --- |
| `verin1.verin1.coil_14` | command | valve pilot 14: pressure on the cap, the cylinder extends |
| `verin1.verin1.coil_12` | command | valve pilot 12: pressure on the rod, the cylinder retracts |
| `verin1.verin-min.state` | feedback | inductive switch at the retracted end |
| `verin1.verin-max.state` | feedback | cylinder switch at the extended end (125 mm) |
| `verin1.verin.position` | feedback | position of the rod, in metres |

The valve has memory: set one pilot, and the spool stays there after the
pilot is released. Extending takes about 2.5 s and retracting about 2.3 s.

## Modbus mapping

`io.json` has one module, `m1`, on `127.0.0.1:1502` (unit 1). It is what
`pantin io init` produces for this scene:

| Tag | Zone | Address | CODESYS variable |
| --- | --- | --- | --- |
| `verin1.verin1.coil_14` | coil | 0 | `verin1_verin1_coil_14` |
| `verin1.verin1.coil_12` | coil | 1 | `verin1_verin1_coil_12` |
| `verin1.verin-min.state` | discrete input | 0 | `verin1_verin_min_state` |
| `verin1.verin-max.state` | discrete input | 1 | `verin1_verin_max_state` |
| `verin1.verin.position` | input register | 0 (REAL, 2 registers) | `verin1_verin_position` |

## Run it

Validate the folder, and print the CODESYS variables:

    pnpm pantin validate examples/plc-cylinder
    pnpm pantin gvl examples/plc-cylinder

Start the core on the examples folder, then the bridge (from
`packages/bridge`, after `setup.sh`):

    node packages/core/src/main.ts --pantins-dir examples
    .venv/bin/python -m pantin_bridge --core http://127.0.0.1:4800 \
      --pantin plc-cylinder --listen 127.0.0.1 --allow 127.0.0.1

A PLC or any Modbus TCP client on 127.0.0.1:1502 can now write the coils and
read the switches. The automated version of this loop is
`packages/bridge/tests/test_closed_loop.py`, run by `pnpm check`. A real
CODESYS program has not driven this scene yet (ADR 0045 stage 2).

## Meshes

The three `meshes/*.glb` come from the vendor STEP file `ID1S0400125E`,
converted by the STEP import of Pantin. The project owner confirmed that
they may be redistributed with Pantin.
