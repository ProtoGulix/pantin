# Connect a PLC

Pantin presents itself to the PLC as **Modbus TCP I/O modules**: the simulator is
the slave, the PLC is the master. The PLC program keeps its usual I/O
configuration and queries the simulated modules as it would query real modules
(ADR 0003).

This page describes the bridge, the network setting, the GVL and the
precautions. To build the machine and its I/O list, follow the
[tutorial](/en/guide/tutorial).

::: tip Verified with a real CODESYS
Driving the `plc-cylinder` example from a real CODESYS Control Win V3 x64 was
verified on 18 October 2026 (see [Configure the PLC](#configure-the-plc-codesys)).
Other CODESYS versions and WAGO targets are not verified. The automatic closed
loop (`packages/bridge/tests/test_closed_loop.py`, run by `pnpm check`) plays the
PLC with a test Modbus client.
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
With the `plc-cylinder` example, CODESYS sent functions 15, 02 and 04 and the
**Low word first** order was right. For other channels or versions, nothing is
verified: if a float value is wrong, try the other **Word order** (ADR 0045
points 6 and 8).
:::

### Losing the PLC: the watchdog

A module becomes "connected" at the first request served. It becomes
"disconnected" again when its last TCP connection closes, or after the watchdog
duration without any request. The core then resets to 0 the **boolean commands**
mapped to that module. Float and integer commands keep their value. The console
writes "PLC disconnected from module m1" with the reason.

## Configure the PLC (CODESYS)

This setup was **verified on 18 October 2026** on a real CODESYS Control Win V3
x64 (IDE with the French interface, version not recorded), with the example
`examples/plc-cylinder`: module `m1`, `192.168.1.161:1502`, unit 1. The variable
names below are those of this example, not of a Pantin built with the
[tutorial](/en/guide/tutorial) (its tags start with `tige`). The menu
names below are those of the French interface, as displayed; the English labels
were not seen, so they are not given.

1. **Generate the GVL** and import it into the CODESYS project:
   - from the viewer: **I/O** view, **Export GVL** button;
   - or from the command line: `pnpm pantin gvl <Pantin folder>`.

   The GVL is a `VAR_GLOBAL` with one variable per channel, for example
   `verin1_verin1_coil_14 : BOOL;`, followed by a comment with the module, the
   zone, the address and the tag. It has **no `AT` addresses**: it is in the
   CODESYS device tree that you link each Modbus channel to these variables.
   Do not edit it: it is regenerated.
2. **Add the master and one server per module.** In the device tree, under
   **Device**, add **Ethernet**, then **Modbus_TCP_Client** (the master: the
   PLC), then one **Modbus_TCP_Server** (a Pantin module) **per module**.
3. **Set the server**, **Général** tab:
   - **Adresse IP** (IP address): the listen address of the bridge (an address such as 192.168.1.161 needs the bridge's **Private network** mode, see [Network: local or private](#network-local-or-private));
   - **Port**: the port of the module (1502 worked);
   - **Unit-ID**: the module's **Unit id** (1 for `m1`).

   **Unit-ID defaults to 16#FF (255).** With 255, the bridge refuses every
   request: the log says "refused a request ... : unit 255, function 16 ...
   -> GATEWAY_NO_RESPONSE (11); this module answers unit 1."
4. **Create the channels**, **Canal serveur Modbus** tab, **Ajouter un canal**
   button (see the [CODESYS help](https://content.helpme-codesys.com/en/CODESYS%20Modbus/_mod_edt_slave_com_channel.html)).
   Rule: **one channel per zone used**, with the lowest address as offset and
   the number of addresses as length, from the address table of the **I/O**
   view. Do not configure a channel on a zone the module does not have (for
   example **Read Holding Registers** on `m1`): the bridge log shows a refused
   request.

   For `m1`, with the **CYCLIC** trigger and 100 ms:

   | Channel | Function | Offset | Length |
   | --- | --- | --- | --- |
   | Commandes | Write Multiple Coils (15) | 0 | 2 |
   | Capteurs | Read Discrete Inputs (02) | 0 | 2 |
   | Position | Read Input Registers (04) | 0 | 2 |

   The **ModbusTCPServer Configuration** tab is only a read-only parameter list.

   Leave the **Init serveur Modbus** tab empty. Seen on 18 October 2026: a
   command of this tab (a register write, function 16, on `m1`) went first on
   each connection; the bridge refused it, and CODESYS sent nothing more after
   that. The log showed the refused request, then "PLC disconnected …
   watchdog", and a reconnection that repeated in a loop.
5. **Link the channels to the variables**, **ModbusTCPServer Mappage E/S** tab:
   double-click the **Variable** column of a line, "…" button, then
   **Application**, **GVL**, the variable (icon "mapper sur la variable
   existante", map onto the existing variable).
   - Commandes `Bit0` → `verin1_verin1_coil_14`, `Bit1` → `verin1_verin1_coil_12`;
   - Capteurs `Bit0` → `verin1_verin_min_state`, `Bit1` → `verin1_verin_max_state`;
   - Position `[0]` and `[1]` (the WORD lines, not their bits) → two WORD
     variables of **your own** GVL.

   Without this link, the **Valeur actuelle** column shows "Pas actualisé
   (vérifier l'info-bulle)".
6. At the bottom of the same tab, set **Toujours actualiser les variables** to
   "Activé 2 (toujours dans la tâche du cycle de bus)". The default value
   ("Utiliser les paramètres de l'appareil parent") does not refresh unused
   variables.

The mapping and the options can only be edited **offline**: if these fields are
greyed out, use **En ligne**, **Déconnexion**. This is what was observed; the
rule "log out to edit" comes from [ABB's CODESYS help](https://help.plc.abb.com/_cds_cmd_login.html).

### A REAL on two registers

In this setup, the channel lines are WORDs: a REAL could not be mapped onto them directly. The bridge sends the **low
word first**. Use a UNION in **your** code (never in the generated GVL):

```text
TYPE U_REAL_WORDS :
UNION
    r : REAL;
    w : ARRAY[0..1] OF WORD;
END_UNION
END_TYPE
```

Declare in the program (`VAR`) `conversion : U_REAL_WORDS;` and, in **your** GVL, `position_word_0 : WORD;` and `position_word_1 : WORD;` (the two variables linked to the `Position[0]` and `Position[1]` lines). Then, each cycle:

```text
conversion.w[0] := position_word_0;
conversion.w[1] := position_word_1;
GVL.verin1_verin_position := conversion.r;
```

On the Windows SoftPLC (little-endian), `w[0]` is the low word. Values are in SI
units (metres): the extended cylinder gave position 0.125, that is words
`16#0000` and `16#3E00`.

The test target is **CODESYS Control Win V3** (the SoftPLC supplied with the
IDE). The Simulation mode of the IDE cuts all communication, so it is not
suitable (CLAUDE.md, section 10).

::: warning Not verified
Still to verify: other CODESYS versions and the English interface (the labels
above are those of the French interface), menu names on WAGO targets, how
CODESYS reconnects after a refused connection, and the 10-channel limit
reported on forums.
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
for now (ADR 0004, open points). If your PLC is not accepted, open the bridge
**Log**: it has a line "Module m1 refused a connection from"
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

## Reading the bridge log

When the PLC connects but nothing works, the bridge log says what the PLC asked and why the bridge refused it.

- In the **PLC bridge** block, click **Log**: the **PLC bridge log** window opens and refreshes by itself, as columns (time, source **Core** or **Bridge**, level), with **Error**, **Warning** and **Info** toggles to filter. **Copy** and **Download** let you attach the log to a request for help.
- Warning and error lines also reach the console: "PLC bridge: …".
- Without the viewer, and even with the core stopped: `pnpm pantin bridge-log <pantinId>`, with `--logs-dir <folder>` if the core was started with that option, `--pantins-dir <folder>` if the Pantins are not in the default folder, and `--follow` to follow the file live.

The file is `<Pantins folder>/.logs/<pantinId>/bridge.log` (details in [Panels and buttons](/en/reference/panels#the-plc-bridge-log)).

Example: the PLC connects, then the connection drops after a few seconds ("no request for 5.0 s"). The log contains:

```text
Module m1 refused a request from 192.168.1.137: unit 255, function 16, address 0, quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.
```

The module answers unit 1 (its **Unit id** in `io.json`), the PLC queries unit 255. This is what the CODESYS **Modbus_TCP_Server** does as long as its **Unit-ID** keeps the default 16#FF (255). Here, the first channel tried was a Write Multiple Registers (16), which this module does not need: only the unit matters in this example.

Set the **Unit-ID** to the module's **Unit id**, then download the project to CODESYS again. The bridge only needs a restart if you change the **Unit id** in `io.json`.

::: tip Seen with CODESYS
This line was obtained with a real CODESYS Control Win V3 and the default **Unit-ID**, on 18 October 2026.
:::

## Forced tags

A command written from the viewer **forces** the tag: the PLC can no longer
write it. The console writes: "PLC write ignored on forced tag …". The **PLC
bridge** block shows "N forced tag(s): the PLC cannot write them" with a
**Release all** button. Release before handing control to the PLC. This is the
usual cause of "the PLC writes but nothing moves" after a manual test from the
viewer: **Release** or **Release all** gives control back to the PLC.

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
- Modbus never goes through a tunnel or a proxy (Cloudflare, nginx): the bridge
  listens on the address you choose, on your network. A tunnel exposure
  protected by Cloudflare Access can start or stop the bridge, but never opens
  the tag bus (ADR 0046 point 7, ADR 0050).
- Before any use on a real production network, the position of Pantin must be
  re-evaluated by a new decision (authentication, TLS, segmentation).

## See also

- [Tutorial: modelling a cylinder](/en/guide/tutorial)
- [Troubleshooting](/en/guide/troubleshooting)
- [ADR 0045: bridge, mapping and Modbus slave](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md)
- [ADR 0046: security of the bridge](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0046-security-of-the-plc-bridge.md)
- [ADR 0004: network exposure](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md)
