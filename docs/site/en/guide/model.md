# The model of a Pantin

This page describes each element of a Pantin machine: what it is, what you set in the viewer, and the **tags** it produces for the PLC. Names in **bold** are those of the interface.

The general principle: a machine is a tree of **bodies** linked by **joints**. An **action chain** (drive then actuator) moves the joints. **Sensors** read the result. The PLC only talks to the tags.

```
   PLC ──tags──> drive ──ports──> actuator ──> joint ──> body
    ^                                            │
    └──────────tags────────── sensor <───────────┘
```

## Concepts: body, assembly, group

Three words come back everywhere in Pantin. Read this section before the procedures.

| Word | What it is | What it does |
| --- | --- | --- |
| **Body** | One 3D mesh file (a GLB, an STL, or one component of a STEP). | Pantin never splits or merges it: one file, one body. A body has no tag. |
| **Assembly** | A node of the structure tree, as in a CAD assembly. | It organises bodies and other assemblies. It has a name and a **key**, which is the prefix of tags. |
| **Group** | An assembly used as an end of a joint. | It forms **one rigid piece**: all its bodies move together. |

A group is not another kind of object: it is an assembly that a joint uses. The word "group" says what it does; the word "assembly" says where it is filed.

### The central rule

**A body with no parent joint moves with its group.**

In an assembly, a body that is the child of no joint therefore stays stuck to its assembly. When a joint moves the assembly, all these bodies follow, without linking them one by one. A body that has a parent joint moves relative to its parent, as before.

Second rule: **the structure tree never carries motion, only joints do.** Filing an assembly inside another does not make it follow the other. For a sub-assembly to follow its parent, or slide relative to it, there must be a joint between the two.

### An example: the cylinder

```
Pantin
└── assembly "verin1"                 filing, tag prefix
    ├── body "corps"                  no parent joint: follows "verin1"
    └── group "Tige"                  sub-assembly, rigid
        ├── body "tige"               no parent joint: follows "Tige"
        └── body "chariot"            no parent joint: follows "Tige"

Joint "Tige":  verin1 ──slider──> Tige
```

A single joint slides the rod and the carriage together. No joint links them to each other.

### What a joint can link

Each end of a joint (parent, child) is a **body** or a **group**. In the joint form, the list offers bodies and **Group: name** entries.

| Case | Rule |
| --- | --- |
| Between two assemblies | The child is a **group**. A body child is refused: the message proposes its group. The parent is a group or a body. |
| Inside one assembly | The child is a **body**. The parent is another body of the same assembly, or the group itself (a ring turning in its bearing). |
| Single parent | A body or a group has at most one joint bringing it to its parent. |
| No loop | Joints never form a loop. A group cannot have one of its own bodies as its parent. |

The origin and the axis of a joint are expressed in the frame of the parent's assembly (the group itself when the parent is a group). The tags of a joint take the key of the assembly it moves: for a child group, the key of the group.

### Why it is organised this way

Before, the import joined each body of an assembly to a "handle" body by a fixed joint: a star of joints, noise in the tree, and a handle picked arbitrarily. Now:

- an import creates no joint inside an assembly, only one fixed joint per sub-assembly, from the parent group to the child group;
- to animate a sub-assembly, you turn that single fixed joint into a slider or a pivot;
- when the import does not split enough (a STEP with no sub-assembly), you make the group yourself: see [Make a group](#make-a-group).

The menu of an assembly in the tree offers **New joint…**, **Hide in the 3D view**, **Isolate in the 3D view** and **Show every assembly**. The menu of the Pantin offers **New assembly**. Every element (drive, sensor, belt...) belongs to an assembly, which provides the prefix of its tags.

## Bodies

A **body** is an imported 3D mesh. Pantin reads:

- **STL**: one file gives one body, with no unit and no hierarchy;
- **GLB** (glTF): node names are kept;
- **STEP**: converted to a mesh by a separate process (OpenCascade).

To import, use **File** then **Import…**, or the **Import into this Pantin** action of the menu of a Pantin. The form asks for the **Unit** of the file and its **Up axis**, then **Import**. STEP conversion can take up to 2 minutes: keep the page open.

A STEP that contains named sub-assemblies becomes several bodies and several assemblies. The import creates no joint inside an assembly: its bodies follow the assembly. It creates one fixed joint per sub-assembly, between the parent group and the child group. A STEP with no sub-assembly gives a single assembly and no joint. GLB and STL files create no joint.

::: warning Not verified
The full path from ZW3D to glTF with the right pivots has not been validated on a real part. For an export from ZW3D, prefer STEP, and check the placement of the bodies after the import.
:::

A body has no tag: it is moved by the joints, or by its group (see [the central rule](#the-central-rule)).

## Joints

A **joint** links a **Parent body** to a **Child body**, which can be bodies or groups (see [What a joint can link](#what-a-joint-can-link)). It has an **origin**, an **axis** (frame of the parent's assembly, Z up) and, depending on its type, limits. Create it with **Edit** then **New joint…** or from the menu of an assembly in the tree.

| Type in the interface | Motion | Own settings |
| --- | --- | --- |
| **Fixed** | none | none |
| **Prismatic (slider)** | translation along the axis, with travel | **Limits** |
| **Revolute (limited pivot)** | rotation around the axis, with stops | **Limits** |
| **Continuous (unlimited pivot)** | rotation with no limit (drum, wheel) | none |
| **Helical (screw and nut)** | translation tied to a rotation | **Pitch (travel per turn)** |

The coordinate of a joint is in metres (prismatic, helical) or in radians (pivots). In the interface, you read it in millimetres and degrees.

The **Take the axis from a face** button places the axis from a face you click in the 3D view. **Reverse the axis** changes the positive direction.

A body or a group has at most one joint bringing it to its parent, and joints never form a loop.

### Make a group

Make a group when the import did not separate what moves: a STEP with no sub-assembly puts all bodies in a single assembly, with no joint. The **Group…** command creates a sub-assembly with the chosen bodies and a fixed joint that links it to the original assembly.

1. In the tree, click the first body. Add the others with <kbd>Ctrl</kbd>+click (adds or removes a row), <kbd>Shift</kbd>+click (the range up to the clicked row) or <kbd>Shift</kbd>+arrows. Only bodies and sub-groups of **one assembly** can be selected together.
2. Choose **Edit** then **Group…**, or **Group…** in the context menu of a selected row.
3. A line appears under the tree: `Group N items of assembly "X": what should the group be called?`. Type the name in the **Group name** field, then click **Group** (or **Cancel**).
4. The message `Group "name" created.` appears.

Nothing moves on screen: the group is attached to the assembly by a **Fixed** joint of the same name. Turning this joint into a **Prismatic (slider)** or a **Revolute (limited pivot)** makes the whole group move.

The message can add two sentences:

- **Joints deleted: …**: fixed joints made useless between the bodies of the group and the rest of the assembly were removed;
- **Tags were renamed: regenerate the PLC's GVL.**: the joints of the moved bodies take the prefix of the new group, so their tags change. `io.json` follows; you must however **export the GVL again** (see [The I/O list](#the-i-o-list-io-json)) and reload it in the PLC program.

**Group…** is offered only if the selection is made of bodies and sub-groups of one assembly, itself filed in a Pantin.

The core refuses, without changing anything, when the group would move a body against its will. Its message is shown word for word. Frequent cases:

| Situation | What to do |
| --- | --- |
| A body of the group hangs, by a moving joint, from a body of the assembly that is not in the group: the group would take it along. | Add the parent body to the group, or delete the joint. |
| A body of the group is linked by a joint to a body that is not in the group: the group would leave it behind. | Add that body to the group, or delete the joint. |
| A joint to delete is used by a drive, an actuator, a sensor or a belt. | Remove that element first, then try again. |

### Ungroup a group

**Ungroup** dissolves a group into the assembly where it is filed: its bodies and sub-groups move into that assembly, without moving on screen.

1. Select the row of the group (an assembly filed inside another assembly).
2. Choose **Edit** then **Ungroup**, or **Ungroup** in its context menu.
3. The message `Group "name" dissolved.` appears, with the same optional sentences as for **Group…** (joints deleted, GVL to regenerate).

A top-level assembly cannot be ungrouped: there is no assembly to pour it into.

The core refuses as long as the bodies of the group would stop following it. Frequent cases:

| Situation | What to do |
| --- | --- |
| A slider or a pivot moves the group: its bodies would no longer follow. | Make that joint **Fixed**, or delete it, then ungroup. |
| The group is held by a joint to an assembly other than the one it would dissolve into. | Delete that joint or change its parent. |
| The group does not move, but the assembly it would dissolve into is moved by a joint: its bodies would start following it. | Ungroup when that assembly does not move, or first hold the group with a fixed joint to it. |
| The group hangs from something that moves inside the destination assembly. | First change the parent of that joint. |
| A tag key of an element of the group already exists in the destination assembly (the message proposes a free key). | Rename one of the two keys. |

Group then ungroup does not guarantee the original document. What is guaranteed: nothing moves on screen. The fixed joints that were deleted are not restored, identifiers or tag keys may differ, and a moving joint that hung from a rigid body may come back attached to the parent group rather than that body. To undo, discard the unsaved changes.

### Move a body to another assembly

Dragging a body onto another assembly (or choosing the **Assembly** in the inspector) moves it. Its fixed joints to the old assembly are deleted and listed in the message. The core refuses the move if the body, its old group and its new group are not moved by the same joint (or by none): then move the whole group, or use **Group…**. The core also refuses when a moving joint links the body to the old assembly (`Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.`), or when the body would "jump" when the groups move (`Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".`). The fixed joints to delete must not be used by another element.

### Tags of a joint

The tags of a joint use the assembly it moves: that of its child body, or the child group itself.

| Tag | Direction | When |
| --- | --- | --- |
| `position` | feedback | always, for a moving joint |
| `setpoint` | command | as long as no actuator moves the joint |

As soon as an actuator moves a joint, the actuator commands it: the `setpoint` tag no longer exists.

### Preview by slider

Each moving joint has a slider (**Position of "name"**) to move it by hand and check the stops.

## The action chain

Neither the drive nor the actuator is a 3D part. Together, they turn a PLC command into motion.

### Drives

The **drive** is the device the PLC commands: valve, contactor, variable speed drive. It carries the command and feedback tags. It moves nothing itself: its output **ports** feed actuators.

Create it with **New drive** (**Drives** section): you give a **Name**, a **Type** and the assembly where its tags are created (**Tags in assembly**).

| Type | Tags produced (direction seen from the PLC) | Output ports |
| --- | --- | --- |
| **Valve 3/2, single solenoid** | `coil_12` (command, bit) | Port 2 |
| **Double valve 3/2** | `coil_14`, `coil_12` (command, bit) | Ports 2 and 4 |
| **Valve 5/2, single solenoid** | `coil_14` (command, bit) | Ports 2 and 4 |
| **Valve 5/2, double solenoid** | `coil_14`, `coil_12` (command, bit) | Ports 2 and 4 |
| **Valve 5/3, closed centre** | `coil_14`, `coil_12` (command, bit) | Ports 2 and 4 |
| **Valve 5/3, exhaust centre** | `coil_14`, `coil_12` (command, bit) | Ports 2 and 4 |
| **Valve 5/3, pressure centre** | `coil_14`, `coil_12` (command, bit) | Ports 2 and 4 |
| **Contactor** | `run` (command, bit) | Output |
| **Reversing contactor** | `forward`, `reverse` (command, bit) | Output |
| **Variable speed drive, on/off** | `run`, `reverse` (command, bit); `speed` (feedback, float) | Output |
| **Variable speed drive, analog** | `speed_setpoint` (command); `speed` (feedback) | Output |
| **Servo drive** | `setpoint` (command, position); `position` (feedback) | Output |

Ports are typed: pneumatic, power or servo. An actuator can only be connected to ports of the right type.

If two contradictory commands are active (both coils of a 5/3 valve, forward and reverse of a reversing contactor), the inspector reports it in **Diagnostics**. It is not a tag.

### Actuators

The **actuator** reads the ports of a drive and moves one or more joints. It has **no tags**. Create it with **New actuator**: choose the **Drive that feeds it** and the **Joints it moves**.

| Type | Inputs | Settings |
| --- | --- | --- |
| **Single-acting cylinder** | **Cap chamber (extends)** | **Extend speed**, **Return speed** |
| **Double-acting cylinder** | **Cap chamber (extends)**, **Rod chamber (retracts)** | **Extend speed**, **Retract speed** |
| **AC motor** | **Power input** | **Nominal speed** |
| **Servo motor** | **Servo input** | none |

A joint is moved by a single actuator. An actuator moves moving joints, all in the same unit (metres or radians). The application refuses a drive that cannot feed all the inputs of the actuator.

A menu on a joint also offers **Add an actuator…**.

## Sensors

A **sensor** watches a joint (**Watched joint**) and gives its state to the PLC through its tags. It simulates no physics. Create it with **New sensor**, or from the menu of a joint with **Add a sensor…** or **Add end-of-stroke switches**.

| Type | Tag (feedback) |
| --- | --- |
| **Ideal switch** | `state` (bit) |
| **Mechanical limit switch** | `state` (bit) |
| **Cylinder sensor (magnetic)** | `state` (bit) |
| **Inductive sensor (axial)** | `state` (bit) |
| **Encoder** | `count` (integer, pulse count) |

The switches offer, among others, the **Normally closed** option, which inverts the contact. The inductive sensor takes the **Target material** into account for its real range.

## Products, conveying and presence sensors

Conveying objects are created from the **Conveying** family of the tree (**New belt**, **New guide**, **New emitter**, **New absorber**, **New presence sensor**). They first ask for an assembly.

| Object | Role |
| --- | --- |
| **Belt** | straight conveyor surface (**Length** by **Width**), driven by a **Drum (continuous joint)** of a given **Drum radius** |
| **Guide** | box that products do not cross (side rail, stop) |
| **Emitter** | creates a box (**Mass**, **Material**) when the `spawn` tag goes to 1 |
| **Absorber** | destroys the products whose centre enters its volume |
| **Presence sensor** | detects products with a ray, instead of watching a joint |

The product is never saved: it only exists while the core is running. The **Create a product** button of the emitter writes 1 then 0 on its `spawn` tag.

The chain of a belt is: a drive (for example a **Contactor**) feeds an actuator (for example an **AC motor**), which moves the joint of the drum, which the belt names.

| Tag | Owner | Direction |
| --- | --- | --- |
| `spawn` | emitter | command (bit) |
| `state` | presence sensor | feedback (bit) |

The **Photoelectric cell** has two modes, **Diffuse** and **Through-beam**, a **Range**, **Normally closed**, and two delays (**On delay**, **Off delay**). It casts its ray along the Z axis of its frame.

Belts, guides and absorbers have no tags.

::: warning Known limits
Only the straight belt is verified. Curved conveyors, rollers, transfers between belts and long simulations are **not** verified. Products are boxes.
:::

## Tags

A tag has a name of the form:

```
assembly.key.member
```

For example `pince.valve.coil_14`. The key comes from the name of the element. It only changes if you rename it yourself: renaming an element therefore never breaks the PLC program.

Each tag has:

- a **type**: bit, integer or float (a bit only accepts 0 or 1);
- a **direction seen from the PLC**: **command** (the PLC writes) or **feedback** (the PLC reads). A feedback cannot be written.

In the inspector, the tags of an element are grouped into **Commands** and **Feedback**. A command that is written takes effect at the next step (1/120 s).

### Force and release a tag

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

Open the **I/O alone** view (**View** menu). If the Pantin has no list yet, **Create the mapping**. You can **Add a module**, **Map** the **Unmapped tags** to a module, **Reassign** or **Remove** a channel. Problems appear in **Problems**.

**Export GVL** downloads the matching CODESYS global variable list. If a tag is renamed, its channel follows; the name of the variable never changes.

What comes next, to actually connect the PLC, is in [Connect a PLC](/en/guide/connect-a-plc). The details of the format are in [ADR 0049](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0049-one-io-json-edited-from-the-viewer.md).

To try all this step by step, follow the [Tutorial](/en/guide/tutorial).
