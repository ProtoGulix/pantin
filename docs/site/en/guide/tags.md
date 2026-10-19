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

- Modbus **modules**, each with its **Key**, its **Port**, its **Unit id**, its **Word order** and its **Watchdog (ms)**;
- **channels**: a **Tag**, a **Variable**, a **Zone**, an **Address** and a **Type**.

Display the **I/O** view in a zone (the zone's selector, or the **View** menu). If the Pantin has no list yet, **Create the mapping**. You can **Add a module**, **Map** the **Unmapped tags** to a module, **Reassign** or **Remove** a channel. Problems appear in **Problems**.

**Export GVL** downloads the matching CODESYS global variable list. If a tag is renamed, its channel follows; the name of the variable never changes.

What comes next, to actually connect the PLC, is in [Connect a PLC](/en/guide/connect-a-plc).

To try all this step by step, follow the [Tutorial](/en/guide/tutorial).
