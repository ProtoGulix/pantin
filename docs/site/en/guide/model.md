# The model of a Pantin

This page sets out the basic notions of a Pantin machine: body, assembly, group and joint. The procedures and the other elements have their own page, listed at the end. Names in **bold** are those of the interface.

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
- when the import does not split enough (a STEP with no sub-assembly), you make the group yourself: see [Make a group](/en/guide/groups#make-a-group).

The menu of an assembly in the tree offers **New joint…**, **Hide in the 3D view**, **Isolate in the 3D view** and **Show every assembly**. The menu of the Pantin offers **New assembly**. Every element (drive, sensor, belt...) belongs to an assembly, which provides the prefix of its tags.

## Bodies

A **body** is an imported 3D mesh. Pantin reads:

- **STL**: one file gives one body, with no unit and no hierarchy;
- **GLB** (glTF): node names are kept;
- **STEP**: converted to a mesh by a separate process (OpenCascade).

To import, use **File** then **Import…**, or the **Import into this Pantin** action of the menu of a Pantin. The form asks for the **Unit** of the file and its **Up axis**, then **Import**. STEP conversion can take up to 2 minutes: keep the page open.

A STEP that contains named sub-assemblies becomes several bodies and several assemblies. The import creates no joint inside an assembly: its bodies follow the assembly. It creates one fixed joint per sub-assembly, between the parent group and the child group. A STEP with no sub-assembly gives a single assembly and no joint. GLB and STL files create no joint.

To prepare your files before the import (sub-assemblies, units, names), see [Preparing 3D models](/en/guide/preparing-models).

::: warning Not verified
The full path from a CAD software to glTF with the right pivots has not been validated on a real part. From a CAD software, prefer STEP, and check the placement of the bodies after the import.
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

The **Take the axis from a face** button places the axis from a face you click in the 3D view; it is offered only for a saved joint whose type moves (see [Panels and buttons](/en/reference/panels)). **Reverse the axis** changes the positive direction.

A body or a group has at most one joint bringing it to its parent, and joints never form a loop.

### Tags of a joint

The tags of a joint use the assembly it moves: that of its child body, or the child group itself.

| Tag | Direction | When |
| --- | --- | --- |
| `position` | feedback | always, for a moving joint |
| `setpoint` | command | as long as no actuator moves the joint |

As soon as an actuator moves a joint, the actuator commands it: the `setpoint` tag no longer exists.

### Preview by slider

Each moving joint has a slider (**Position of "name"**) to move it by hand and check the stops.

## What next

- [Group, ungroup, move a body](/en/guide/groups): the structure procedures.
- [Drives, actuators and sensors](/en/guide/action-chain): the chain that animates the joints.
- [Products and conveying](/en/guide/conveying): belts, emitters, presence sensors.
- [Tags, faults and the I/O list](/en/guide/tags): what the PLC sees.
- [Tutorial](/en/guide/tutorial): all of it, step by step.
