# Tutorial: modelling a cylinder

This tutorial builds, step by step in the viewer, the machine of the example
[`examples/plc-cylinder`](https://github.com/ProtoGulix/pantin/blob/develop/examples/plc-cylinder/README.md):
a double-acting cylinder with a 125 mm stroke, fed by a 5/2 double solenoid
valve, with two end-of-stroke sensors. At the end, a PLC can drive it over
Modbus TCP.

The notions used (Pantin, assembly, body, joint, drive, actuator, sensor, tag)
are explained in [the fundamentals](/en/guide/fundamentals) and [the model](/en/guide/model).
Read them first if these words are new to you.

::: tip To compare
The `examples/plc-cylinder` folder holds the machine this tutorial builds, with
the same names. Copy it into the Pantins folder of the core to open it and
compare.
:::

## What you need

- The core and the viewer started with `pnpm serve` (from a clone of the
  repository, after `pnpm setup:python`). This command enables STEP import and
  the PLC bridge. The viewer is then at `http://127.0.0.1:4800`.
- A cylinder file in STEP, GLB or STL format. The example uses the
  manufacturer file `ID1S0400125E`, a STEP with three components: the body, the
  rod and the carriage. This original file is not in the repository, only its
  three GLB meshes are. With your own file, the names and values change, the
  approach stays the same.

::: warning STEP import
Without `--step-converter-python`, the core refuses STEP with the message
"STEP import unavailable". In that case, export the part as GLB or STL.
See [Troubleshooting](/en/guide/troubleshooting).
:::

In this tutorial, the names in **bold** are the exact labels of the viewer in
English.

## 1. Create a Pantin

![The welcome window, Home tab](/screenshots/en/welcome.webp)

1. Open the viewer. The **Welcome — Pantin** window appears. If not, open the
   **File** menu, then **Welcome**.
2. In the **Home** tab, under **New**, click the **Empty Pantin** tile.
3. Type a name in the **Name of the new Pantin** field (for example
   `plc-cylinder`), then click **Create**.

The Pantin is created and opened. It is empty: the 3D view shows a message
"Open a Pantin to see its bodies in 3D" as long as it has no body.

The **From a 3D file** tile creates the Pantin and imports the file in a single
action. The result is the same as with steps 1 and 2.

## 2. Import the 3D model

![The import form under the toolbar, with the Up axis list](/screenshots/en/import-form.webp)

1. In the toolbar, click the import button (tooltip **Import a 3D file (GLB,
   STL, STEP) into the open Pantin**). The **File** menu, **Import…** does the
   same thing.
2. Choose your file. A small form appears under the toolbar, with the name of
   the file and its format.
3. For a STEP, as here, there is nothing to set: the unit is read from the
   file and Z is up. For the other formats the form asks for:
   - **Unit** (STL only): `m (metres)`, `mm (millimetres)`, `cm (centimetres)`
     or `in (inches)`, the unit in which the file was drawn. A GLB is in metres.
   - **Up axis** (GLB and STL): **Z up (CAD)** for a CAD file, **Y up (glTF
     standard)** for a GLB coming from Blender.
4. Click **Import**.

For a STEP, the text "Converting STEP… Up to 2 minutes; keep this page open"
appears. The conversion runs in a separate process.

### Splitting into bodies

The split is automatic, you do not choose nodes:

- GLB and STL: one file gives one body.
- STEP: one component of the assembly gives one body. The bodies are placed in
  an assembly, **with no joint at all**: a body with no parent joint moves with
  its assembly (see [Concepts](/en/guide/model#concepts-body-assembly-group)).
  A STEP that contains named sub-assemblies also gives one fixed joint per
  sub-assembly. A message tells you how many bodies were imported.

For the example, the import creates three bodies (`ID1S0400125E_0_1`, `_0_2` and
`ID1S040CF-16040_3`) in a single assembly, and no joint.

::: tip Choosing the bodies
The viewer does not let you choose which nodes of the file become bodies, nor
merge or split bodies. A GLB file stays one body. To gather bodies that move
together, use **Group…** (step 4).
:::

The left panel shows the tree: the Pantin, its assembly and its
bodies. Click a body to select it and see its properties in the inspector on the
right.

## 3. Name the assembly and its tags

The PLC tags start with an assembly key, then the key of the element:
`verin1.verin1.coil_14` reads "assembly `verin1`, drive `verin1`, coil 14".

1. In the tree, select the assembly created by the import.
2. In the inspector, read the **Key (tag prefix)** field. You change it like the
   other fields.
3. Enter `verin1` to get the names of the example.

Changing the displayed name (**Edit**, **Rename**, or F2) does not change the
key. The tags follow the key.

## 4. Group the rod and place the cylinder joint

After the import, no joint exists: the three bodies follow the assembly. For the
rod to slide, you must first say which bodies move together: the rod
(`ID1S0400125E_0_2`) and the carriage (`ID1S040CF-16040_3`). The cylinder body
(`ID1S0400125E_0_1`) stays fixed. That is the job of a **group**.

### Group the rod and the carriage

1. In the tree, unfold the assembly and click `ID1S0400125E_0_2`, then
   <kbd>Ctrl</kbd>+click `ID1S040CF-16040_3`.
2. Choose **Edit**, **Group…**.
3. The line `Group 2 items of assembly "…": what should the group be called?`
   appears under the tree. Type `Tige` in **Group name**, then click **Group**.
4. The message `Group "Tige" created.` appears. Nothing moves: the group `Tige`
   is a sub-assembly, linked to the assembly by a **Fixed** joint named `Tige`.

The full procedure, the possible refusals and **Ungroup** are in
[Group, ungroup, move a body](/en/guide/groups#make-a-group).

### Turn the fixed joint into a slider

The group is already linked to the assembly: you must not create a second joint,
but **transform** this one into a **Prismatic (slider)**.

1. In the tree, right-click the joint `Tige` (**Joints between assemblies**
   folder), then choose **Change type…**.
2. In the **Change joint "…"** form, choose **Prismatic (slider)** in
   **Type**, then fill in:

| Field | Value for the example |
| --- | --- |
| **Name** | `verin` |
| **Parent body** | already filled: the cylinder's assembly (a **Group: …** entry). Do not change it. |
| **Child body** | already filled: the group (the **Group: Tige** entry). Do not change it. |
| **Origin** | 0, 0, 0 (in mm, in the frame of the assembly) |
| **Axis** | X, with **Reversed**: the axis of the example is (-1, 0, 0) |
| **Limits**: **lower** / **upper** | 0 and 125 (mm) |

3. Click **Apply**. Editing the joint does not change its tag key.
4. In the tree, select the `verin` joint. In the inspector, **General** group,
   change the **Tag key** (it is `tige`, from the group's name) to `verin`. It
   gives the middle part of the joint's tags.

A few hints for the axis:

- **Take the axis from a face**: then click a cylindrical face in the 3D view.
  Esc cancels.
- **Reverse the axis** flips the direction. The arrow in the 3D view shows the
  positive direction of travel: the rod must extend in the positive direction.
- The axis is expressed in the frame of the parent's assembly (the group itself when the parent is a group), Z up.

Check the result with the **Position of "verin"** slider: drag it, the rod **and**
the carriage must move together between 0 and 125 mm without leaving the body.

The tags of this joint start with the key of the assembly it moves, here the
group: `tige.verin.setpoint` (while no actuator moves it) and
`tige.verin.position`. They do not start with `verin1`. The sensors of the joint
(step 8) are filed in the same assembly: `tige.verin-min.state` and
`tige.verin-max.state`. The valve of step 5 keeps `verin1.verin1.coil_14` and
`verin1.verin1.coil_12`.

To create a joint between two elements that have no parent yet, right-click the
assembly then **New joint…** (or **Edit**, **New joint…**) to open the **New
joint in "…"** form, with the same fields. If the child already has a parent,
the core refuses: "Body ... already has the parent joint ... Delete that joint
first". Then delete the old joint (right-click, **Delete**).

If the position of the model is not right, the inspector offers **Positioning**
tools: **Move (G)**, **Rotate (R)** and **Align (A)**. They are outside the
scope of this tutorial.

## 5. Add the drive: the valve

![The New drive form in the inspector](/screenshots/en/form-new-drive.webp)

The drive is the device the PLC commands. Here, it is the valve.

1. In the inspector, look for the **Drives** section, or the **New drive**
   button (in the toolbar of the inspector, and in the diagram, see step 7).
2. Fill in the **New drive** form:
   - **Name**: `verin1`.
   - **Type**: **Valve 5/2, double solenoid**.
   - **Tags in assembly**: the `verin1` assembly.
3. Confirm.

The valve carries two command tags: **Coil 14** (`coil_14`, pressure on the cap
of the cylinder, it extends) and **Coil 12** (`coil_12`, pressure on the rod
side, it retracts). Its outputs are **Port 4** (`port_4`) and **Port 2**
(`port_2`).

The valve has a memory: a pulse on a coil sets the spool, and it stays there
when the coil drops. If both coils are active together, the spool keeps its
position, with no diagnostic. The **Conflicting commands** diagnostic only
exists for 5/3 valves and the reversing contactor.

## 6. Add the actuator: the cylinder

![The New actuator form in the inspector](/screenshots/en/form-new-actuator.webp)

The actuator reads the outputs of the drive and moves a joint.

1. Click **New actuator** in the toolbar of the inspector. The button is greyed
   out as long as no slider or pivot exists: the message "Create a slider or a
   pivot first" reminds you. A right-click on the `verin` joint, then **Add an
   actuator…**, opens the same form with the joint already chosen.
2. In the **New actuator** form:
   - **Type**: **Double-acting cylinder**.
   - **Drive that feeds it**: `verin1`, the valve from step 5. **No drive fits
     this type** appears if no compatible valve exists.
   - **Joints it moves**: `verin`.
   - **Extend speed** and **Retract speed**: the example uses 0.05 m/s and
     0.055 m/s, that is 50 and 55 mm/s.
3. Confirm.

The cylinder has two inputs: **Cap chamber (extends)** and **Rod chamber
(retracts)**. In the example, the cap chamber is linked to **Port 4** of the
valve and the rod chamber to **Port 2**. Check it in the diagram (step 7).

::: tip Units
For a slider, the speed fields are in mm/s: enter 50 and 55. For a pivot, they
are in degrees per second.
:::

## 7. See and link the chain in the diagram

![The chain diagram: valve, cylinder, joint and sensors](/screenshots/en/diagram.webp)

The central area has a top zone and a bottom zone, each with its own view
selector at the top left (**3D**, **Diagram**, **Joints**, **I/O**). By default,
the 3D view is on top and the diagram below. If the diagram is not displayed,
choose **Diagram** in the selector of the bottom zone (the **+** button opens
that zone). The F4 key moves the top zone to the next view.

The diagram shows four columns: **Drives**, **Actuators**, **Joints** and
**Sensors**. The **New drive**, **New actuator** and **New sensor** buttons at
the top of the columns are the same as those of the inspector.

- To **link** two elements, drag the link from an output port to an input port,
  or use **Link to…** (Enter on a power port, from the keyboard).
- To **remove** a link: select it, then **Remove this link** or the Del key.
- The diagram refuses impossible links and says why, for example "Joint verin is
  fixed: no actuator can move it".

For the example, you must see: valve `verin1`, port 4 to the cap chamber, port 2
to the rod chamber, cylinder to the `verin` joint.

## 8. Add the end-of-stroke sensors

A sensor always watches a joint. There are several types:
**Ideal switch**, **Mechanical limit switch**, **Inductive sensor (axial)**,
**Cylinder sensor (magnetic)**, **Encoder**.

### The two limit switches in one click

1. Right-click the `verin` joint.
2. Choose **Add end-of-stroke switches**.

The viewer creates two **Mechanical limit switch** sensors named `verin min` and
`verin max`, triggered at 2% of the travel before each stop (2.5 mm here). The
message "End-of-stroke switches "verin min" and "verin max" created" appears.

### The sensors of the example

The example uses other types: an **Inductive sensor (axial)** `verin min` on the
retracted side and a **Cylinder sensor (magnetic)** `verin max` on the extended
side. To reproduce them:

1. Right-click the `verin` joint, then **Add a sensor…** (or the **New sensor**
   button of the inspector).
2. In **New sensor**, choose the **Type**, the **Name** and the **Watched joint**
   (`verin`), then the parameters the form offers for this type.
3. Confirm.

Values of the example:

| Sensor | Type | Settings |
| --- | --- | --- |
| `verin min` | inductive (axial) | face at 0 mm, nominal distance 5 mm, steel material, hysteresis 1%, normally open |
| `verin max` | cylinder sensor (magnetic) | position 125 mm, switching window 2 mm, hysteresis 1 mm, normally open |

The exact labels of the parameters depend on the type. For a sensor of another
type, use those of the form. A dimensioned drawing of the sensor and its
detection zone is shown for the limit switches.

Each sensor adds a `state` feedback tag, for example
`tige.verin-min.state`.

Remember to save: **File**, **Save** (Ctrl+S), or the **Save** button of the
toolbar. Unsaved changes are flagged by **Unsaved changes**.

## 9. Test without a PLC

The core simulates continuously. You can command the valve by hand.

### Force a command

![A coil forced from the diagram, with its F mark](/screenshots/en/forced-tag.webp)

1. Display the **Diagram** in one of the zones, or select the valve and look at
   the **Commands** group of the inspector.
2. In the diagram, click the **Coil 14** command: it is a switch (**On** /
   **Off**). The rod extends in about 2.5 s.
3. Click **Coil 12** to make it retract (about 2.3 s).

Watch:

- the position in the **Position** or **Feedback** group of the inspector;
- the sensors: `state` goes true near each stop;
- switching the coils off does not bring the rod back: the valve has a memory.

::: warning A write from the viewer forces the tag
Any command written from the viewer **forces** the tag: a **forced** badge
appears and the PLC can no longer write it, until you release it. Use
**Release** on the tag, or **Release all** in the simulation bar (also in
**Edit**, **Release all forced tags**). Remember to release everything before
handing control to the PLC.
:::

### Inject a fault

In the inspector, **Faults** group, you can enable **Not responding** on the
drive, or **Jammed** on the joint, to see what happens to your program.

### The simulation bar

![The transport bar: Pause, 1 step, 10 steps, Reset, simulated time and step count](/screenshots/en/transport-bar.webp)

At the top of the central area:

| Button | Effect |
| --- | --- |
| **Pause** / **Resume** | stops or restarts simulated time |
| **1 step** / **10 steps** | advances by 1 or 10 steps, only while paused |
| **Reset** | clears products, commands and faults |

A step lasts 1/120 s. The simulated time is shown next to it. If the core falls
behind, a warning appears.

::: warning Pause and PLC
A simulation paused while a PLC is connected shows it a frozen machine. The
console says so: "Simulation paused while a PLC bridge is connected".
:::

## 10. Configure the inputs and outputs

![The I/O view with module m1, its settings and the channel table](/screenshots/en/io-view.webp)

The PLC does not see the tags directly: it reads and writes Modbus coils and
registers. The I/O list (`io.json`) makes the link. It is edited in the viewer,
never by hand.

1. At the bottom of the left panel, find the **PLC bridge** block.
2. Click **I/O config**. The **I/O** view is displayed in the top zone (if it was in no zone yet).
3. If the Pantin has no I/O list, the message "This Pantin has no I/O list
   (io.json) yet" appears with the **Create the mapping** button. Click it: it
   creates a first empty module, `m1`, on port 1502. Use **Add a module**
   (**Modules** section) only for an additional module: it takes the next free
   key and port (`m2`, 1503).
4. **Unmapped tags** section: click **Map all** to put all the tags in the
   module, or **Map to m1** tag by tag.
5. If needed, set **Module settings**: **Key**, **Port**, **Unit id**,
   **Word order** (**Low word first** by default) and **Watchdog (ms)**.
6. Save the Pantin (Ctrl+S).

For a Pantin built with this tutorial, the result should look like this:

| Tag | Zone | Address | CODESYS variable |
| --- | --- | --- | --- |
| `verin1.verin1.coil_14` | coil | 0 | `verin1_verin1_coil_14` |
| `verin1.verin1.coil_12` | coil | 1 | `verin1_verin1_coil_12` |
| `tige.verin-min.state` | discrete input | 0 | `tige_verin_min_state` |
| `tige.verin-max.state` | discrete input | 1 | `tige_verin_max_state` |
| `tige.verin.position` | input register | 0 (REAL, 2 registers) | `tige_verin_position` |

Each line of **Channels** has a **Tag**, a **Variable**, a **Zone**, an
**Address**, a **Type** and a **Comment**. Problems (a tag mapped twice,
overlapping addresses...) are listed under **Problems**; click **Go to the cell
concerned** to fix them.

From a tag in the inspector, **Map** puts a tag in a module without leaving the
current view, and **Open in I/O** shows it in the module.

## 11. Generate the CODESYS GVL

The GVL is the global variable list that you paste into the CODESYS project.

**From the viewer**

1. In the **I/O** view, click **Export GVL**.
2. The browser downloads a text file. It contains the mapping as displayed,
   unsaved changes included.

The button is greyed out, with a tooltip, as long as the mapping is missing,
unreadable or invalid.

**From the command line**

```sh
pnpm pantin gvl examples/plc-cylinder
```

The command prints the GVL on standard output. It refuses an invalid mapping
and lists the problems. For a Pantin without `io.json`, the command line
`pnpm pantin io init <folder>` (option `--transport <kind>`, `modbus_tcp_slave` by default) creates a pre-filled mapping: the `m1` module, on
port 1502, with all the tags already mapped. **Create the mapping**, in the
viewer, creates an empty `m1`; **Map all** then does the rest.

The GVL starts with a warning: the PLC under test must never drive real outputs
at the same time. It contains no `AT` addresses: it is the CODESYS project that
links the Modbus channels to these variables. The page
[Connect a PLC](/en/guide/connect-a-plc) explains what comes next.

## 12. Start the bridge

![The PLC bridge card, bridge running](/screenshots/en/bridge-running.webp)

1. Save the Pantin and check, in **I/O config**, that the mapping has no
   problem.
2. In the **PLC bridge** block, the pill shows the state (**Stopped**). The round
   button on the title line is **Start**.
3. The network is **Local only (127.0.0.1)** by default. Click the network pill
   to change it, see [Connect a PLC](/en/guide/connect-a-plc).
4. Click **Start**. The state goes to **Starting…** then **Running**.
5. Each module appears with its address (`127.0.0.1:1502`) and its state:
   **waiting for the PLC**, then **PLC connected** when a Modbus client queries
   it.

While the bridge is running, any change to the I/O stops it: the text "Any I/O
edit stops the bridge" reminds you. Then start it again with **Restart**.

If the block shows "Start the core with `--bridge-python <path>`", the core was
not started with `pnpm serve`. If the bridge shows **Failed**, the title and the
bridge log give the cause: see [Troubleshooting](/en/guide/troubleshooting).

To test the loop without CODESYS, any Modbus TCP client will do: write coil 0 of
`127.0.0.1:1502`, unit 1, the cylinder extends, then read discrete input 1.

## Next

- [Connect a PLC](/en/guide/connect-a-plc): CODESYS settings, local or private
  network, security.
- [Troubleshooting](/en/guide/troubleshooting): the error messages and what to do.

::: warning Known limits
- The labels and messages of this tutorial come from the code. The exact name of the joint and the key of the group are those the viewer proposes: read them in the tree. If a form refuses, read the core's message: it says what to fix.
- A real CODESYS Control Win V3 x64 drove this scene (`plc-cylinder`): see the [setup](/en/guide/connect-a-plc#configure-the-plc-codesys). Other versions and WAGO targets have not been tried.
:::
