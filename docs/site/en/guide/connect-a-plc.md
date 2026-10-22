# Connect a PLC

Pantin presents itself to the PLC as **Modbus TCP I/O modules**: the simulator is
the slave, the PLC is the master. The PLC program keeps its usual I/O
configuration and queries the simulated modules as it would query real modules.

This page describes the Modbus TCP connection. The I/O view can also create an "OPC UA client" module, and the left panel then has a second card, **PLC bridge · OPC UA client**; the OPC UA connection is not described here yet.

This page describes the bridge, the network setting, the GVL and the
precautions. To build the machine and its I/O list, follow the
[tutorial](/en/guide/tutorial).

The `plc-cylinder` example is driven by a CODESYS Control Win V3 x64 with the
settings of [Configure the PLC](#configure-the-plc-codesys).

## How it works

```text
PLC (CODESYS)  <--Modbus TCP-->  bridge (Python)  <--tag bus-->  core  <--REST/SSE-->  viewer
```

- The **core** simulates the machine and holds the tags.
- The **bridge** is a separate process. It opens one Modbus TCP slave **per
  module** of `io.json` and copies the tags into its registers, and the other
  way round.
- The core starts and stops the bridge on demand, from the **PLC bridge · Modbus TCP** block
  of the viewer. This requires the `--bridge-python` option, which
  `pnpm serve` provides.

## One module, one port

Each module of the I/O list is an independent Modbus slave, with its own
settings:

| Setting | Default | Rule |
| --- | --- | --- |
| **Key** | `m1`, `m2`... | unique |
| **Port** | 1502 and following | 1024 to 65535, unique; never 502 by default |
| **Unit id** | 1 | 1 to 247; a request for another unit gets exception 11 |
| **Word order** | **Low word first** | for 32-bit values |
| **Watchdog (ms)** | 1000 | 100 to 3,600,000 |

Port 502 needs special rights on most systems: Pantin never chooses it
on its own.

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

### Losing the PLC: the watchdog

A module becomes "connected" at the first request served. It becomes
"disconnected" again when its last TCP connection closes, or after the watchdog
duration without any request. The core then resets to 0 the **boolean commands**
mapped to that module. Float and integer commands keep their value. The console
writes "PLC disconnected from module m1" with the reason.

## Configure the PLC (CODESYS)

This setup is the one of the `examples/plc-cylinder` example with a CODESYS
Control Win V3 x64: module `m1`, `192.168.1.161:1502`, unit 1. The variable
names below are those of this example, not of a Pantin built with the
[tutorial](/en/guide/tutorial) (its tags start with `tige`). The menu names
are those of the French interface of CODESYS.

1. **Generate the GVL** and import it into the CODESYS project:
   - from the viewer: **I/O** view, **Export GVL** button;
   - or from the command line: `pnpm pantin gvl <Pantin folder>`.

   The GVL is a `VAR_GLOBAL` with one variable per channel, for example
   `verin1_verin1_coil_14 : BOOL;`, followed by a comment with the module, the
   zone, the address and the tag. It has **no `AT` addresses**: it is in the
   CODESYS device tree that you link each Modbus channel to these variables.
   Do not edit it: it is regenerated. A channel whose variable is a dotted name
   (`GVL_IO.Verin1.FinCourseSortie`) is not declared there: it is a variable that
   your program already declares, and the header of the GVL lists it. A feedback
   tag mapped in two modules appears once.

   To review the mapping with an electrician or paste it into a wiring
   document, export it as a spreadsheet file: **I/O** view, **Export CSV**
   button, or `pnpm pantin io export <Pantin folder> --output mapping.csv`
   (prefer `--output` to a `>` redirection: in Windows PowerShell 5.1 a
   redirection re-encodes the file, NOT VERIFIED). `pantin gvl` accepts
   `--output` too. The file has one row per channel (columns `module`,
   `transport`, `endpoint`, `tag`, `variable`, `direction`, `address`, `plcType`,
   `comment`; for Modbus, for example `Modbus TCP slave`, `port 1502, unit 1`,
   `coil 0`, `BOOL`), comma-separated, in
   UTF-8 with a byte order mark so that spreadsheets read accents correctly. A
   comment that starts with `=`, `+`, `-` or `@` (or a tab or a carriage
   return), such as `-B12`, is written with a leading apostrophe so that the
   spreadsheet shows it as text and not as a formula; depending on the
   spreadsheet, the apostrophe may appear in the cell (NOT VERIFIED). If your spreadsheet puts everything
   in one column (a regional setting expecting semicolons), use its import
   function and choose the comma. The export is read-only: edits made in the
   file are never read back, change the mapping in the viewer.
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

   Leave the **Init serveur Modbus** tab empty. A command of this tab goes
   first on each connection. If it targets a zone the module does not have (for
   example a register write, function 16, on `m1`), the bridge refuses it and
   CODESYS sends nothing more after that: the log shows the refused request,
   then "PLC disconnected … watchdog", in a loop.
5. **Link the channels to the variables**, **ModbusTCPServer Mappage E/S** tab:
   double-click the **Variable** column of a line, "…" button, then
   **Application**, **GVL**, the variable (icon "mapper sur la variable
   existante", map onto the existing variable).
   - Commandes `Bit0` → `verin1_verin1_coil_14`, `Bit1` → `verin1_verin1_coil_12`;
   - Capteurs `Bit0` → `tige_verin_min_state`, `Bit1` → `tige_verin_max_state`;
   - Position `[0]` and `[1]` (the WORD lines, not their bits) → two WORD
     variables of **your own** GVL.

   Without this link, the **Valeur actuelle** column shows "Pas actualisé
   (vérifier l'info-bulle)".
6. At the bottom of the same tab, set **Toujours actualiser les variables** to
   "Activé 2 (toujours dans la tâche du cycle de bus)". The default value
   ("Utiliser les paramètres de l'appareil parent") does not refresh unused
   variables.

The mapping and the options can only be edited **offline**: if these fields are
greyed out, use **En ligne**, **Déconnexion**
(see [ABB's CODESYS help](https://help.plc.abb.com/_cds_cmd_login.html)).

### A REAL on two registers

In this setup, the channel lines are WORDs: a REAL cannot be mapped onto them directly. The bridge sends the **low
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
GVL.tige_verin_position := conversion.r;
```

On the Windows SoftPLC (little-endian), `w[0]` is the low word. Values are in SI
units (metres): a cylinder extended to 0.125 m gives the words
`16#0000` and `16#3E00`.

The test PLC is **CODESYS Control Win V3**, the SoftPLC supplied with the IDE.
The Simulation mode of the IDE cuts all communication, so it is not suitable.

## Reuse the PLC's variable names

If your CODESYS program already exists, the viewer (the **Import PLC symbols**
window) or the `pantin io import-symbols` command reads its symbol export and
**proposes** the variable names for the signals that are already mapped, so you do not
retype them. The import creates no channel and **never stores the symbols**: only the
chosen variable names are written to `io.json`.

A complete path, from the CODESYS export to the closed loop, is in the
[tutorial](/en/guide/tutorial-plc-symbols).

**Produce the export in CODESYS.** Under the **Application**, add a **Symbol
configuration** object (the menu is named **Configuration des symboles** in the
French interface), tick the variables to expose, then run **Build > Generate
code**. The file `<project>.<device>.<application>.xml` appears in the project
folder. Menu names may differ by version; the procedure was verified on CODESYS 3.5
SP22. Other versions and other PLC software are not verified.

**From the viewer.** Open the **I/O** view and click **Import PLC symbols…** in its
toolbar. The button is greyed, with a tooltip that says why, while the mapping is not
readable. Choose the `.xml` file (8 MiB at most): the core reads it and the **Import PLC
symbols** window opens. Nothing changes before **Apply**.

![The symbol import window, with its five sections and the summary at the bottom](/screenshots/en/io-symbols.webp)

At the top, the window repeats the file, the recognised format and the number of
symbols read, then the project, the device and the application. Five sections follow,
each with its count in brackets; an empty section shows **No rows.**

| Section | Content | Checkbox |
| --- | --- | --- |
| **Sure matches** | Compatible type and no remark from the core, however the symbol was found. | Checked at the start |
| **To check** | The other matches: a type to check or a remark from the core. | Unchecked at the start |
| **Unchanged** | The channel already has this name. | None |
| **Signals without a match** | No symbol fits, or several do: the row says **No variable matches: choose one, or leave it empty.** or **Several variables fit: choose one.** | A drop-down list, on **(do not change)** at the start |
| **Unused symbols** | The variables with no signal, with the reason (for example **No signal matches this variable.**). | None |

Each row says in words what it proposes: **Current variable**, **Proposed variable**
and **Match** (**identical name**, **close name (case and separators ignored)** or **end
of the name recognised (key and member)**). A match whose type is to check is marked by a
vertical bar on the edge of the row, a warning triangle and a sentence from the core saying what
differs, for example that the Modbus channel carries REAL while the PLC variable is
LREAL: the triangle and the sentence are enough, colour is never the only cue. A match of an incompatible type has no
checkbox: **Incompatible type: this row will not be applied.** The drop-down list of an
unmatched signal offers the variables the core found ambiguous, then those no signal
took; if there are none, it says **No free variable to offer.**

A match is **sure** when its type is compatible and the core has no remark. How it was
found (identical name, close name, end of the name) makes no difference: it is written
in words on the row.

At the bottom, **Variables to apply: n** counts the checked boxes and the choices made
in the lists. **Apply** sends exactly those rows and choices, nothing else; it is greyed
while the count is zero. **Cancel**, the **Escape** key and the cross close the window
without sending anything.

After **Apply**, the window says **Variables applied: n. Change not saved yet.** It does not detail the applied rows: only the refused rows are listed. If the
core refused some rows (for example a variable already taken by another tag), they are
listed under **Rows refused by the core: n**, with the reason. The applied names are an
edit of the mapping like any other: save it, or undo it with the Pantin.

![The window after Apply: three variables applied, change not saved](/screenshots/en/io-symbols-done.webp)

A file that is too large, of an unknown format, or that contains control characters is
explained in the window: nothing is changed.

**On the command line.** The same import exists as a command, useful in a script:

```
pnpm pantin io import-symbols <Pantin folder> <file.xml> [--format <id>] [--apply] [--accept-warnings]
```

Without `--apply` it writes nothing and prints a preview. On a copy of
`examples/plc-cylinder` and the sample file of the repository, it prints:

```
Format codesys-symbolconfiguration, project "Untitled" (Application): 61 symbols read.
Matched: 3
  [m1] tige.verin-min.state: tige_verin_min_state -> GVL.verin1_verin_min_state (suffix, compatible)
  ...
To check (warnings): 0
Incompatible (never applied): 0
Unchanged: 2
  [m1] verin1.verin1.coil_14: verin1_verin1_coil_14 (exact, compatible)
  ...
Unmatched signals: 0
Unused symbols: 56
```

The preview has five parts:

- **Matched**: proposed variables, compatible with the signal's type;
- **To check (warnings)**: matches to check by hand;
- **Incompatible**: matches of an incompatible type, never applied;
- **Unchanged**: the channel already has this name;
- **Unmatched signals**: signals with no symbol, and **Unused symbols**: symbols with no signal, with the reason.

**The three matching rules**, tried in this order:

1. **exact**: the symbol has the variable's current name;
2. **normalised**: the same name as the variable derived from the tag (for example `tige_verin_position`), once case, `_` and `.` are ignored;
3. **suffix**: the symbol's last segment ends with the tag key followed by the member (for example `verin1_verin_min_state`), cut at `_` boundaries. A CamelCase name has no boundary: it only matches whole.

A match is kept only when it is unique on both sides.

**Apply.** `--apply` writes the compatible proposals to `io.json` (in version 2).
`--accept-warnings` adds the ones to check. The exit code is 1 when an entry was
skipped (for example a variable already held by another tag), otherwise 0. A dotted
variable name is written to `io.json` but, as always, is not declared in the GVL.

::: warning Caution
The command writes to the folder: run it on a Pantin that no core holds open with
unsaved edits. A core that has it open sees the change after discarding the edits or
reopening the Pantin. The viewer window has no such problem: it goes through the core.
:::

## Network: local or private

In the **PLC bridge · Modbus TCP** block, click the network pill (**Network: local**) to open
the choice. There are two, and only two.

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
reuses it. The settings are locked while the bridge is
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

Addresses of the shared space `100.64.0.0/10`, sometimes used by the NAT of
virtual machines, are **refused**. If your PLC is not accepted, open the bridge
**Log**: it has a line "Module m1 refused a connection from" followed by the
address, for each refused connection.

## Start, stop, restart

1. Save the Pantin; its mapping must be valid.
2. In the **PLC bridge · Modbus TCP** block, click **Start**. The state goes from
   **Starting…** to **Running** when all the slaves are open.
3. Each module shows its address and its state: **waiting for the PLC**,
   **PLC connected** or **bridge stopped**.
4. **Stop** closes the slaves. **Restart** appears after a failure.

Other rules:

- The bridge **does not reconnect** on its own: if the link with the core closes
  or if the I/O changes, it stops and you have to start it again. The core does
  not restart it.
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

- In the **PLC bridge · Modbus TCP** block, click **Log**: the **PLC bridge log** window opens and refreshes by itself, as columns (time, source **Core** or **Bridge**, level), with **Error**, **Warning** and **Info** toggles to filter. **Copy** and **Download** let you attach the log to a request for help.
- Warning and error lines also reach the console: "PLC bridge: …".
- Without the viewer, and even with the core stopped: `pnpm pantin bridge-log <pantinId>`, with `--transport <kind>` (for example `modbus_tcp_slave`) when several files exist, `--logs-dir <folder>` if the core was started with that option, `--pantins-dir <folder>` if the Pantins are not in the default folder, and `--follow` to follow the file live.

The file is `<Pantins folder>/.logs/<pantinId>/bridge-<kind>.log` (`bridge-modbus_tcp_slave.log` for Modbus) (details in [Panels and buttons](/en/reference/panels#the-plc-bridge-log)).

Example: the PLC connects, then the connection drops after a few seconds ("no request for 5.0 s"). The log contains:

```text
Module m1 refused a request from 192.168.1.137: unit 255, function 16, address 0, quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.
```

The module answers unit 1 (its **Unit id** in `io.json`), the PLC queries unit 255. This is what the CODESYS **Modbus_TCP_Server** does as long as its **Unit-ID** keeps the default 16#FF (255). Here, the first channel tried was a Write Multiple Registers (16), which this module does not need: only the unit matters in this example.

Set the **Unit-ID** to the module's **Unit id**, then download the project to CODESYS again. The bridge only needs a restart if you change the **Unit id** in `io.json`.

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
the machine.
:::

- **Never connect a PLC that drives real outputs.** A PLC trusts the feedback
  from Pantin. Use a SoftPLC, or a PLC whose field I/O is **disconnected**.
  The generated GVL says so in its header.
- Pantin reaches no real actuator: its outputs only move simulated joints.
- Services listen on `127.0.0.1` by default. Opening the network is an explicit
  choice, limited to private networks.
- Modbus never goes through a tunnel or a proxy (Cloudflare, nginx): the bridge
  listens on the address you choose, on your network. A tunnel exposure
  protected by Cloudflare Access can start or stop the bridge, but never opens
  the tag bus.
- Pantin is not meant for a production network: it has no authentication, no TLS and no segmentation.

## See also

- [Tutorial: modelling a cylinder](/en/guide/tutorial)
- [Troubleshooting](/en/guide/troubleshooting)

::: warning Known limits
Only CODESYS Control Win V3 x64 has been tried, with the French interface. Other versions, the English interface and WAGO targets are untested: menu names may differ. If a float value is wrong, try the other **Word order**. Forums report a limit of 10 channels per Modbus device in CODESYS: beyond it, spread the channels over several modules. The `tige_verin_*` variable names of this example have not been tried on CODESYS yet: the run of 18 October 2026 used the former names `verin1_verin_*`, with the same addresses. How CODESYS reconnects after Pantin refuses a connection has not been tried. The behaviour of CODESYS depending on the network mode of a virtual machine (NAT or bridged) has not been measured.
:::
