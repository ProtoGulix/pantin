# Tags, faults and the I/O list

This page describes what the PLC sees: tags, injectable faults and the `io.json` file that links them to CODESYS variables and Modbus addresses.

A tag has a name of the form:

```
assembly.key.member
```

For example `pince.valve.coil_14`. The key comes from the name of the element. It only changes if you rename it yourself: renaming an element therefore never breaks the PLC program.

Each tag has:

- a **type**: bit, integer or float (a bit only accepts 0 or 1);
- a **direction seen from the PLC**: **command** (the PLC writes) or **feedback** (the PLC reads). A feedback cannot be written.

In the inspector, the tags of an element are grouped into **Commands** and **Feedback**. A command that is written takes effect at the next step (1/120 s).

## List the signals

A signal is described by its name, type, direction, unit and the element that owns it. The following command reads the saved `pantin.json`, without the core:

```
pnpm pantin signals examples/plc-cylinder
```

```
NAME                   TYPE   DIRECTION  UNIT   OWNER
tige.verin.position    float  feedback   metre  joint verin
verin1.verin1.coil_14  bit    command    none   drive verin1
verin1.verin1.coil_12  bit    command    none   drive verin1
tige.verin-min.state   bit    feedback   none   sensor verin min
tige.verin-max.state   bit    feedback   none   sensor verin max
```

`--json` prints the same list as JSON (`{ "signals": [...] }`). The core also serves it, unsaved edits included, at `GET /api/pantins/:pantinId/signals`.

The unit is `metre`, `radian`, `metre_per_second`, `radian_per_second`, `percent`, `none` (bits, counts) or `unknown` (a servo drive that does not feed an actuator yet). Values stay in SI units and are never scaled.

## Force and release a tag

When you write a command from the viewer (**Send** button), the tag is **forced**: a **forced** badge appears. While it is forced, the PLC's writes to this tag are ignored, and the **Console** notes it.

To give control back to the PLC, use **Release** on the tag, or **Release all** or **Release all forced tags** (**Edit** menu). A released tag takes the last value written by the PLC, if it wrote one.

::: tip
Forcing is for testing without a PLC: you command the machine by hand, like a maintenance operator.
:::

## Injectable faults

Two faults let you test how the PLC reacts. You set them in the **Faults** group of the inspector.

- **Not responding**: the drive ignores commands.
- **Jammed**: the joint no longer moves. The fault is carried by the joint, not by the actuator.

Faults and products are cleared by **Reset the simulation** (**Edit** menu). Unsaved changes and the clock stay.

## The I/O list (io.json)

The `io.json` file links tags to PLC variables and to Modbus addresses. It **never defines** a tag: tags come from the Pantin. It only contains:

- **modules**, each with its **Key** and its **transport** (the way of talking to the PLC). The only transport available is `modbus_tcp_slave` (**Modbus TCP slave**), whose settings are the **Port**, the **Unit id**, the **Word order** and the **Watchdog (ms)**;
- **channels**: a **Tag**, a **Variable**, a **Comment** and, for the Modbus transport, a **Zone**, an **Address** and a **Type**.

The file is in version 2: the transport settings are in the module's `transport` object, and the zone, address and type in the channel's `modbus` object. A feedback tag (sensor, position...) can be mapped in several modules, with the same variable, declared once; a command is mapped in one module only. The I/O view does not offer an already mapped tag yet: today the second module is set through the API.

Display the **I/O** view in a zone (the zone's selector, or the **View** menu). If the Pantin has no list yet, **Create the mapping**. You can **Add a module**, **Map** the **Unmapped tags** to a module, **Reassign** or **Remove** a channel. Problems appear in **Problems**.

**Export GVL** downloads the matching CODESYS global variable list. If a tag is renamed, its channel follows; the name of the variable never changes.

A **Variable** can be a dotted name of 1 to 8 identifiers, such as `GVL_IO.Verin1.FinCourseSortie`: it is then a variable that **your** program already declares. The generated GVL does not declare it and lists it in its header. Whether CODESYS accepts such a name in the mapping of a Modbus channel, structure members included, is not verified.

### Version 1 files

An `io.json` in version 1 (without a `transport` object) opens normally: the core converts it when reading and rewrites it in version 2 at the next save. Opening it does not mark the Pantin as modified. Addresses, variables and the GVL do not change, so the CODESYS project needs no change. A file in a version newer than the one Pantin can read is refused (see [Troubleshooting](/en/guide/troubleshooting)).

What comes next, to actually connect the PLC, is in [Connect a PLC](/en/guide/connect-a-plc).

To try all this step by step, follow the [Tutorial](/en/guide/tutorial).
