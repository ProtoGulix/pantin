# The model of a Pantin

This page defines the basic notions of a Pantin machine: body, assembly, group and joint. The procedures and the other elements have their own page, listed at the end. Names in **bold** are those of the interface.

A machine is a tree of **bodies** linked by **joints**. An **action chain** (drive, then actuator) moves the joints. **Sensors** read the result. The PLC only talks to the tags.

```
   PLC ──tags──> drive ──ports──> actuator ──> joint ──> body
    ^                                            │
    └──────────tags────────── sensor <───────────┘
```

## Concepts: body, assembly, group

These three words come back everywhere in Pantin.

| Word | What it is | What it does |
| --- | --- | --- |
| **Body** | One 3D mesh: a GLB file, an STL file, or one part of a STEP. | Pantin never splits or merges it: one file, one body. A body has no tag. |
| **Assembly** | A node of the structure tree, like a CAD assembly. | It organises bodies and other assemblies. It has a name and a **key**, which is the prefix of tags. |
| **Group** | An assembly that serves as an end of a joint. | It forms **one rigid piece**: all its bodies move together. |

A group is not another kind of object: it is an assembly used in a joint. The word "group" says what the assembly does; the word "assembly" says where it is filed.

### The central rule

**A body with no parent joint moves with its group.**

A body that is the child of no joint stays stuck to its assembly. When a joint moves the assembly, all these bodies follow, without linking them one by one.

A body that has a parent joint moves relative to its parent.

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

The bodies of an assembly follow the assembly: there is no joint to create between them. This avoids a star of fixed joints around an arbitrarily chosen body.

- An import creates no joint inside an assembly. It creates one fixed joint per sub-assembly, from the parent group to the child group.
- To animate a sub-assembly, you turn that fixed joint into a slider or a pivot.
- When the import does not split enough (a STEP with no sub-assembly), you make the group yourself: see [Make a group](/en/guide/groups#make-a-group).

To check the result, open the **Joints** view (view selector of the central area). It draws the tree of joints, with the fixed World on the left: you see which groups move relative to what, and a body or a sub-assembly that stays attached to World when you expected it to follow a group. See [The Joints view](/en/reference/views#the-joints-view).

The menu of an assembly in the tree offers **New joint…**, **Hide in the 3D view**, **Isolate in the 3D view** and **Show every assembly**. The menu of the Pantin offers **New assembly**. Every element (drive, sensor, belt...) belongs to an assembly, which provides the prefix of its tags.

## Bodies

A **body** is an imported 3D mesh. Pantin reads:

- **STL**: one file gives one body, with no unit and no hierarchy;
- **GLB** (glTF): node names are kept;
- **STEP**: converted to a mesh by a separate process (OpenCascade).

To import, use **File** then **Import…**, or the **Import into this Pantin** action of the menu of a Pantin. The form asks for the **Unit** (STL only) and the **Up axis** (GLB and STL), then **Import**. A STEP has nothing to set: its unit is read from the file and Z is up. STEP conversion can take up to 2 minutes: keep the page open.

What each format gives:

- A STEP with named sub-assemblies gives several bodies and several assemblies, with one fixed joint per sub-assembly.
- A STEP with no sub-assembly gives a single assembly and no joint.
- A GLB or an STL gives one body and no joint.

To prepare your files before the import, see [Preparing your CAD files](/en/guide/preparing-models).

A body has no tag: it is moved by the joints, or by its group (see [the central rule](#the-central-rule)).

## Joints

A **joint** links a **Parent body** to a **Child body**, which can be bodies or groups (see [What a joint can link](#what-a-joint-can-link)). It has an **origin**, an **axis** (frame of the parent's assembly, Z up) and, depending on its type, limits. Create it with **Edit** then **New joint…**, or from the menu of an assembly in the tree.

| Type in the interface | Motion | Own settings |
| --- | --- | --- |
| **Fixed** | none | none |
| **Prismatic (slider)** | translation along the axis, with travel | **Limits** |
| **Revolute (limited pivot)** | rotation around the axis, with stops | **Limits** |
| **Continuous (unlimited pivot)** | rotation with no limit (drum, wheel) | none |
| **Helical (screw and nut)** | translation tied to a rotation | **Pitch (travel per turn)** |

The coordinate of a joint is in metres (prismatic, helical) or in radians (pivots). In the interface, you read it in millimetres and degrees.

The **Take the axis from a face** button places the axis from a face you click in the 3D view. **Reverse the axis** changes the positive direction. The first is offered only for a saved joint whose type moves (see [Panels and buttons](/en/reference/panels)).

### In which frame a joint is read

A joint's origin and axis are read in the frame of its **parent's** assembly (the group itself when the parent is a group). This is not the frame of the group it moves.

The trihedron shown in the 3D view when a joint is selected is that frame. Turning the frame of the moved group therefore never changes the numbers of its joint.

A tilted axis (rails at 70°, for example) reads `[0, 0, 1]` after **Align the frame on this axis**, without moving anything:

- The command is in the joint form. It is offered only for a joint already created whose type moves, never for a **Fixed** joint.
- It is disabled while the form has changes not applied. Click **Apply** first: it uses the axis stored in the document.
- It turns the frame of the parent's assembly and that of the group the joint moves. No body moves.
- The message names the turned assemblies and the joints whose numbers changed. The other joints of the same parent are rewritten too, since they are read in the same frame.
- When nothing changed, the message is **The frames are already aligned on this axis, nothing changed.**

With a large parent the list can be long: group the rails first to get a small parent (see [Group](/en/guide/groups)). The steps for tilted slides are in [Preparing your CAD files](/en/guide/preparing-models#align-the-frame-of-each-moving-sub-assembly-with-its-motion).

### Tags of a joint

The tags of a joint use the assembly it moves: that of its child body, or the child group itself.

| Tag | Direction | When |
| --- | --- | --- |
| `position` | feedback | always, for a moving joint |
| `setpoint` | command | as long as no actuator moves the joint |

As soon as an actuator moves a joint, the actuator commands it: the `setpoint` tag does not exist.

### Preview by slider

Each moving joint has a slider (**Position of "name"**) to move it by hand and check the stops.

## What next

- [Group, ungroup, move a body](/en/guide/groups): the structure procedures.
- [Drives, actuators and sensors](/en/guide/action-chain): the chain that animates the joints.
- [Products and conveying](/en/guide/conveying): belts, emitters, presence sensors.
- [Tags, faults and the I/O list](/en/guide/tags): what the PLC sees.
- [Tutorial](/en/guide/tutorial): all of it, step by step.

::: warning Known limits
The full path from a CAD software to glTF, with the right pivots, has not been tried on a real part. From a CAD software, prefer STEP and check the placement of the bodies after the import.
:::
