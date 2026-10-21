# Tutorial: reuse the variables of a CODESYS program

This tutorial starts from a CODESYS program that already exists and from the example
[`examples/plc-cylinder`](https://github.com/ProtoGulix/pantin/blob/develop/examples/plc-cylinder/README.md).
Instead of retyping the names of the program's variables in Pantin, you read them from
the CODESYS symbol export. At the end the loop is closed: the program drives the
cylinder and reads its sensors.

It assumes you followed the [cylinder tutorial](/en/guide/tutorial) (or copied
the `plc-cylinder` example from the **Examples** section of Home) and know the settings of
[Connect a PLC](/en/guide/connect-a-plc). The import window is described in detail in
[Reuse the PLC's variable names](/en/guide/connect-a-plc#reuse-the-plc-s-variable-names);
its buttons and fields are listed in the [I/O view](/en/reference/views#the-import-plc-symbols-window).

::: tip To try without CODESYS
The file `packages/plc-symbol-formats/fixtures/codesys-3.5-sp22.xml` of the repository
is a real export (CODESYS 3.5 SP22, project name replaced). It is enough to follow
steps 2, 3 and 5 without CODESYS.
:::

Names in **bold** are the exact labels of the viewer in English.

## What the import does, and does not do

- It **proposes** a variable name for each signal already mapped, and you confirm.
- It creates no channel, changes no Modbus address and **never stores the symbols**:
  only the chosen names are written to `io.json`.
- The symbol file holds **no Modbus address**: the wiring of the channels is still done
  in the CODESYS device tree (step 4).

## 1. Export the symbols from CODESYS

1. In the project tree, under the **Application**, add a **Symbol Configuration**
   object (the exact path of the add menu is NOT VERIFIED: look for "Add Object" in the
   context menu of the application).
2. In that object, tick the variables Pantin must know: those of your program that are
   linked to the module's channels (commands and sensors). The other variables do not
   need to be there.
3. Run **Build > Generate Code**.
4. The file `<project>.<device>.<application>.xml` is written in the project folder, for
   example `myproject.Device.Application.xml`. This is the one to give to Pantin. The
   file `<application>._symbols`, which CODESYS sends to the controller, is a different
   file: Pantin does not read it.

The file format was read from a real export of CODESYS 3.5 SP22; the menu path comes
from the CODESYS documentation and a third-party example (version 3.5 SP12), not from
a test on SP22. Other versions, other targets (WAGO, Linux) and the "IEC Symbol Set
Configuration" object of recent versions are NOT VERIFIED. The names of the French
CODESYS menus are NOT VERIFIED either (the object is probably called **Configuration
des symboles**, and **Build > Generate Code** probably **Compiler > Générer le code**).

## 2. Import the symbols into Pantin

![The I/O view with module m1, its settings and the channel table](/screenshots/en/io-view.webp)

1. If you have no copy yet, click the **plc-cylinder** card in the **Examples** section of Home, keep the proposed name and click **Create**; otherwise open your copy. In the **PLC bridge** block, click **I/O
   config**: the **I/O** view is displayed.
2. Click **Import PLC symbols…** in the toolbar of the view. If the button is greyed, the
   mapping is not readable: read the tooltip and the problems listed under the table.
3. Choose the `.xml` file (8 MiB at most). The core reads it and the **Import PLC
   symbols** window opens. Nothing is written before **Apply**.

![The symbol import window, with its five sections and the summary at the bottom](/screenshots/en/io-symbols.webp)

This picture comes from another symbol file than the test file (a made-up file that
fills every section): with the test file, the sections do not have this content.

### Reading the window

At the top, check the **Format recognised**, the number of symbols read and the
**Project … · device … · application …** line: is it your project?

Then go through the five sections, from top to bottom:

1. **Sure matches**: compatible type, no remark, boxes checked at the start. With
   `plc-cylinder` and the test file, three signals are there: `tige.verin-min.state`,
   `tige.verin-max.state` and `tige.verin.position` get
   `GVL.verin1_verin_min_state`, `GVL.verin1_verin_max_state` and
   `GVL.verin1_verin_position` (match **end of the name recognised (key and member)**).
   Read each row: **Current variable**, **Proposed variable**, **Match**.
2. **To check**: boxes unchecked at the start. A row marked by a vertical bar, a warning
   triangle and a sentence explaining what to check (it may come from the type or the transport,
   in English) has a remark: tick it only if you are sure. A row **Incompatible type: this row will not be applied.** has no
   checkbox.
3. **Unchanged**: the channel already has this name. Here, the two commands
   `verin1_verin1_coil_14` and `verin1_verin1_coil_12`.
4. **Signals without a match**: pick the variable in the row's drop-down list, or leave
   **(do not change)**. With `plc-cylinder` and the test file, the section is empty
   (**No rows.**).
5. **Unused symbols**: the variables of the export that no signal takes (here the
   constants, the I/O configuration variables and the `PLC_PRG` variables that no signal
   takes), with the reason. They are
   not applied, which is normal.

The number at the bottom, **Variables to apply: n**, counts the checked boxes and the
choices made in the lists. Click **Apply**: only those rows are sent. **Cancel**, the
**Escape** key and the cross close the window without changing anything.

![The window after Apply: three variables applied, change not saved](/screenshots/en/io-symbols-done.webp)

The window says **Variables applied: 3. Change not saved yet.** If the core refuses
rows (for example a variable already taken by another tag), they are listed with the
reason. The applied names are an edit like any other: close the window and **save the
Pantin** (Ctrl+S), or undo it.

## 3. Generate the GVL again

The imported names are **dotted names** (`GVL.verin1_verin_min_state`): they designate
variables your program already declares. Pantin's GVL therefore no longer declares them,
otherwise CODESYS would see the same variable twice. It only lists them in its header
comment.

1. In the **I/O** view, click **Export GVL**. The button is greyed while the mapping is
   missing, unreadable or invalid.
2. Or, on the command line, from a clone of the repository:

   ```sh
   pnpm pantin gvl <Pantin folder>
   ```

For `plc-cylinder` after the import, the GVL declares only the two commands:

```text
// Declared by your PLC program, not here (a dotted name). Map these channels
// to those variables in the device tree:
//   GVL.verin1_verin_min_state : BOOL // m1 discrete_input 0, tige.verin-min.state
//   GVL.verin1_verin_max_state : BOOL // m1 discrete_input 1, tige.verin-max.state
//   GVL.verin1_verin_position : REAL // m1 input_register 0, tige.verin.position
VAR_GLOBAL
  verin1_verin1_coil_14 : BOOL; // m1 coil 0, verin1.verin1.coil_14
  verin1_verin1_coil_12 : BOOL; // m1 coil 1, verin1.verin1.coil_12
END_VAR
```

(This excerpt leaves out the warning that opens the file.) The export of the **I/O**
view includes unsaved edits; save anyway before moving on.

Do not replace your project's GVL with this file: in the test file, all five variables
are declared in the PLC's own `GVL`, and the imported dotted names point into it. So:

- variables named with a dot stay declared where they are, in your program's GVL;
- only the variables without a dot (here the two commands) come from the generated
  file. Put it in a separate GVL, or keep the dotted variables in the existing GVL and
  remove only the duplicates. With the test file, the GVL already declares the two
  commands, so the second option applies.

How CODESYS handles a duplicate name or a separate GVL: NOT VERIFIED.

## 4. Close the loop in CODESYS

The settings are those of [Configure the PLC](/en/guide/connect-a-plc#configure-the-plc-codesys):
one **Modbus_TCP_Server** per module, the channels, then the I/O mapping. Here, in the
**Variable** column of the **ModbusTCPServer Mappage E/S** tab:

1. Link each channel to the variable Pantin proposed: for example `Bit0` of the sensors
   to `GVL.verin1_verin_min_state`. The commands point to the variables of the new GVL.
2. Build, log in to the controller (**En ligne**, the menu name of the French
   interface), then start the program.
3. In Pantin, save, check that the **I/O** view has no problem, then click **Start** in
   the **PLC bridge** block. The state goes to **Running**, then the module shows **PLC
   connected** as soon as CODESYS queries it.
4. Check the loop: in your program, switch on the command that extends the cylinder. It
   extends on screen in about 2.5 s, and the extended-end sensor
   (`tige.verin-max.state`) becomes true in Pantin as well as in the CODESYS variable.
   Do the same for the retraction.

If the module stays **waiting for the PLC**, or if the bridge log shows a refused
request, see [Troubleshooting](/en/guide/troubleshooting).

::: warning NOT VERIFIED
- That a CODESYS Modbus channel accepts as its target a variable designated by a dotted
  name (`GVL.xxx`) in the I/O mapping: NOT VERIFIED.
- That a real CODESYS program drives `plc-cylinder` with the names imported by this
  tutorial: NOT VERIFIED. The test of 18 October 2026 used names written by hand.
:::

## 5. Alternative: the command line

Steps 2 and 3 also exist without the viewer, useful in a script:

```sh
pnpm pantin io import-symbols <Pantin folder> <file.xml>
pnpm pantin io import-symbols <Pantin folder> <file.xml> --apply
pnpm pantin gvl <Pantin folder> --output GVL.txt
```

- Without `--apply`, the first command writes nothing and prints the preview:
  **Matched**, **To check (warnings)**, **Incompatible (never applied)**,
  **Unchanged**, **Unmatched signals** and **Unused symbols**.
- `--apply` writes the compatible matches to `io.json`; `--accept-warnings` adds those to
  check. The exit code is 1 if the core refused an entry while applying.
- Work on a copy of the folder, or on a Pantin that no core has open with unsaved
  edits: the command writes directly in the folder.

## Next

- [Connect a PLC](/en/guide/connect-a-plc): the network, the watchdog, the matching
  rules in detail.
- [Tags, faults and the I/O list](/en/guide/tags)
- [Troubleshooting](/en/guide/troubleshooting)
