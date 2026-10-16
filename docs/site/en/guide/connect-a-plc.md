# Connect a PLC

Pantin presents itself to the PLC as **Modbus TCP I/O modules**: the simulator is
the slave, the PLC is the master. The PLC program keeps its usual I/O
configuration and queries the simulated modules as it would query real modules
(ADR 0003).

This page describes the bridge, the network setting, the GVL and the
precautions. To build the machine and its I/O list, follow the
[tutorial](/en/guide/tutorial).

::: warning Not yet demonstrated with a real CODESYS
A real CODESYS program driving a scene has **not been demonstrated yet**
(CLAUDE.md, phase 7; ADR 0045, step 2). What is tested: an automatic closed
loop, with a test Modbus client that plays the PLC
(`packages/bridge/tests/test_closed_loop.py`, run by `pnpm check`). Everything
this page says about the CODESYS side comes from the documentation of the
repository, not from a measurement.
:::

## How it works

```text
PLC (CODESYS)  <--Modbus TCP-->  bridge (Python)  <--tag bus-->  core  <--REST/SSE-->  viewer
```

- The **core** simulates the machine and holds the tags.
- The **bridge** is a separate process. It opens one Modbus TCP slave **per
  module** of `io.json` and copies the tags into its registers, and the other
  way round (ADR 0045, 0048).
- The core starts and stops the bridge on demand, from the **PLC bridge** block
  of the viewer (ADR 0050). This requires the `--bridge-python` option, which
  `pnpm serve` provides.

## One module, one port

Each module of the I/O list is an independent Modbus slave, with its own
settings (ADR 0049):

| Setting | Default | Rule |
| --- | --- | --- |
| **Key** | `m1`, `m2`... | unique |
| **Port** | 1502 and following | 1024 to 65535, unique; never 502 by default |
| **Unit id** | 1 | 1 to 247; a request for another unit gets exception 11 |
| **Word order** | **Low word first** | for 32-bit values |
| **Watchdog (ms)** | 1000 | 100 to 3,600,000 |

Port 502 needs special rights on most systems: the repository never chooses it
on its own (ADR 0046 point 9).

The IP address is not a module setting: all the modules of a bridge listen on
the same address, chosen at startup (see below). To tell two modules apart, the
PLC uses different **ports**.

## Functions and addresses

The bridge answers function codes 1 to 6, 15, 16 and 23. Any other code gets
exception 1, an address outside the mapped range gets exception 2, and a wrong
quantity or byte count gets exception 3.

| Zone | Direction seen from the PLC | Function codes | Types |
| --- | --- | --- | --- |
| `coil` | command (output) | 1, 5, 15 | BOOL |
| `discrete_input` | feedback (input) | 2 | BOOL |
| `holding_register` | analog command | 3, 6, 16, 23 | REAL, DINT |
| `input_register` | analog feedback | 4 | REAL, DINT |

- Addresses are numbered **from 0** (not the "40001" notation).
- A REAL (32-bit IEEE 754 float) or a DINT takes **two registers**: `address`
  and `address + 1`.
- A tag of type bit becomes a BOOL, a float a REAL, an integer always a DINT.
- Values are in SI units: metres, radians, metres per second.

::: warning Not verified
The repository has not verified which function codes CODESYS Control Win V3
actually sends, nor the word order expected for a REAL (the **Low word first**
default is an assumption based on the little-endian architecture), nor the unit
id that CODESYS sends. If a float value is wrong, try the other **Word order**
(ADR 0045 points 6 and 8).
:::

### Losing the PLC: the watchdog

A module becomes "connected" at the first request served. It becomes
"disconnected" again when its last TCP connection closes, or after the watchdog
duration without any request. The core then resets to 0 the **boolean commands**
mapped to that module. Float and integer commands keep their value. The console
writes "PLC disconnected from module m1" with the reason.

## Configure the PLC (CODESYS)

What the repository documents, and nothing more.

1. **Generate the GVL** and import it into the CODESYS project:
   - from the viewer: **I/O** view, **Export GVL** button;
   - or from the command line: `pnpm pantin gvl <Pantin folder>`.

   The GVL is a `VAR_GLOBAL` with one variable per channel, for example
   `verin1_verin1_coil_14 : BOOL;`, followed by a comment with the module, the
   zone, the address and the tag. It has **no `AT` addresses**: it is in the
   CODESYS device tree that you link each Modbus channel to these variables.
2. **Add a Modbus TCP master** and one Modbus TCP slave per module, with the IP
   address and the **port** shown in the **PLC bridge** block (for example
   `127.0.0.1:1502`) and the **unit id** of the module.
3. Declare the channels from the address table: commands on the `coil`,
   feedback on the `discrete_input`, analog values on the registers.
4. Link each channel to the variable of the same name in the GVL.

The test target is **CODESYS Control Win V3** (the SoftPLC supplied with the
IDE). The Simulation mode of the IDE cuts all communication, so it is not
suitable (CLAUDE.md, section 10).

::: warning Not verified
The exact CODESYS menu names, the channels to create for the registers, how
CODESYS reconnects after a refused connection and support for port 1502 are not
verified: the repository has no CODESYS virtual machine (ADR 0045, step 2;
spike 0009).
:::

## Network: local or private

In the **PLC bridge** block, click the network pill (**Network: local**) to open
the choice. There are two, and only two (ADR 0004).

| Mode | Label | Effect |
| --- | --- | --- |
| Local | **Local only (127.0.0.1)** | listens on 127.0.0.1: the PLC runs on the same machine |
| Private | **Private network** | listens on **one** private address of the machine, with a list of allowed sources |

In **Private network**:

- **Listen address**: a list offers 127.0.0.1 then the private addresses of the
  machine.
- **Allowed PLCs (IPs or CIDRs, comma separated)**: at least one entry (1 to
  16), for example `192.168.56.10` or `192.168.56.0/24`. An entry outside the
  private ranges is refused, because no source could match it.
- A public address, a wildcard one (`0.0.0.0`, `::`), a link-local one
  (`169.254.x.x`) or a host name is refused.
- Any connection from a source outside the private ranges or outside the list is
  closed **on acceptance, before the first byte is read**.
- At most 4 connections per module.

The network choice is **not saved**: each start of the core goes back to local
mode. While it runs, the core keeps the last network in memory, and **Restart**
reuses it (ADR 0050 point 6). The settings are locked while the bridge is
running.

The mode of the bridge is independent of that of the core: the expected case is
a local core, a viewer on the same machine and a bridge open on a private
network towards a CODESYS virtual machine.

### Virtual machine: NAT or bridged

If CODESYS runs in a virtual machine, the network mode of the virtual machine
changes the source address that Pantin sees:

- in **bridged** mode, the PLC appears with its address on the private network:
  put it in the list of allowed PLCs;
- in **NAT**, the connection can come from the host itself, for example
  `127.0.0.1`: no address list then tells the PLC apart from another local
  program.

::: warning Not measured
The exact behaviour of CODESYS depending on the network mode has not been
measured (spike 0004b pending, ADR 0046). Addresses of the shared space
`100.64.0.0/10`, sometimes used by the NAT of virtual machines, are **refused**
for now (ADR 0004, open points). If your PLC is not accepted, look at the output
of the core: the bridge writes a line "Module m1 refused a connection from"
followed by the address, for each refused connection.
:::

## Start, stop, restart

1. Save the Pantin; its mapping must be valid.
2. In the **PLC bridge** block, click **Start**. The state goes from
   **Starting…** to **Running** when all the slaves are open.
3. Each module shows its address and its state: **waiting for the PLC**,
   **PLC connected** or **bridge stopped**.
4. **Stop** closes the slaves. **Restart** appears after a failure.

Other rules:

- The bridge **does not reconnect** on its own: if the link with the core closes
  or if the I/O changes, it stops and you have to start it again. The core does
  not restart it (ADR 0050).
- Any change to the I/O list stops the bridge.
- Closing the Pantin does not stop it: the viewer asks whether to stop it as well
  (**Stop the bridge and close**, **Close without stopping the bridge**).
- One bridge per Pantin. A bridge started by hand outside Pantin and already
  connected is shown: "A bridge started outside Pantin is connected."; stop it
  first.

Without the viewer, the bridge is started by hand (see
[`packages/bridge/README.md`](https://github.com/ProtoGulix/pantin/blob/develop/packages/bridge/README.md)):

```sh
.venv/bin/python -m pantin_bridge --core http://127.0.0.1:4800 \
  --pantin plc-cylinder --listen 127.0.0.1 --allow 127.0.0.1
```

## Forced tags

A command written from the viewer **forces** the tag: the PLC can no longer
write it. The console writes: "PLC write ignored on forced tag …". The **PLC
bridge** block shows "N forced tag(s): the PLC cannot write them" with a
**Release all** button. Release before handing control to the PLC.

## Security

::: danger Modbus has no authentication
Any device allowed by the address filter can write the commands and read the
feedback. The address filter is not authentication: it does not protect against
a spoofed address on a shared network, and it does not replace the firewall of
the machine (ADR 0004, 0046).
:::

- **Never connect a PLC that drives real outputs.** A PLC trusts the feedback
  from Pantin. Use a SoftPLC, or a PLC whose field I/O is **disconnected**
  (ADR 0046 point 10). The generated GVL says so in its header.
- Pantin reaches no real actuator: its outputs only move simulated joints.
- Services listen on `127.0.0.1` by default. Opening the network is an explicit
  choice, limited to private networks.
- Modbus never goes through a tunnel or a proxy (Cloudflare, nginx): the core
  refuses to start or stop the bridge on a request coming from such a tunnel
  (ADR 0046 point 7).
- Before any use on a real production network, the position of Pantin must be
  re-evaluated by a new decision (authentication, TLS, segmentation).

## See also

- [Tutorial: modelling a cylinder](/en/guide/tutorial)
- [Troubleshooting](/en/guide/troubleshooting)
- [ADR 0045: bridge, mapping and Modbus slave](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md)
- [ADR 0046: security of the bridge](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0046-security-of-the-plc-bridge.md)
- [ADR 0004: network exposure](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md)
