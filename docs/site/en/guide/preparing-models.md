# Preparing your CAD files

This page explains how to prepare your files **in your CAD software, before the import**. A few minutes of organisation there save most of the work in the viewer. The words **body**, **assembly** and **group** are defined in [The model of a Pantin](/en/guide/model#concepts-body-assembly-group).

## The golden rule: one sub-assembly per kinematic group

**Put everything that moves together in the same sub-assembly.**

A kinematic group is a set of parts that move as one block. In a cylinder, the barrel is on one side. The rod and its rod end, which extend and retract together, are on the other. That makes two groups, so two sub-assemblies:

```
Cylinder                       root assembly
├── Barrel                     sub-assembly: stays in place
│   └── barrel
└── Rod                        sub-assembly: extends and retracts
    ├── rod
    └── rod end
```

### Why

When a STEP is imported, each sub-assembly becomes a Pantin **assembly** and each part a **body**. The bodies of an assembly stay stuck to it: there is no joint to create inside.

The import creates one **Fixed** joint per sub-assembly, from the parent group to the child group. To animate the rod, you turn that fixed joint into a **Prismatic (slider)**.

If the sub-assembly does not exist in the file, you build it after the import with **Group…** (see below). Doing it once in the CAD is faster.

Example: a supplier's cylinder exported as STEP, with three parts in a single assembly. Pantin imports three bodies in one assembly and cannot guess that the rod moves. Split the assembly in the CAD (barrel on one side, rod and rod end on the other), or use **Group…** after the import.

## Formats

| Format | What Pantin gets from it | Good to know |
| --- | --- | --- |
| **STEP** (`.stp`, `.step`) | The structure is kept: each sub-assembly becomes an assembly, each part a body. Everything is converted to metres. | The format to prefer. The conversion runs in a separate process and can take up to 2 minutes. |
| **GLB** (glTF) | One file gives **one body**. | The nodes of a GLB are not split into several bodies. Two parts that move separately must be two files. |
| **STL** | One file gives one body. | No unit and no hierarchy: the import form asks for the **Unit**. |

### What the conversion of a STEP does

- Each part (leaf of the tree) becomes a body, in a GLB file in metres, Z up, at the place the assembly gives it. Nothing moves compared to the CAD.
- Each sub-assembly becomes an assembly, at every level of the tree. A file with several roots gives an assembly named after the file.
- Parts with no faces to draw (wires, points, construction geometry) are ignored.
- A STEP with an assembly instance that is **scaled or mirrored** is refused: "The assembly "name" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances." Draw symmetric parts as real parts, with no mirror instance, before export.
- A STEP with no solid at all is refused: export the model with its solids, not only surfaces or a wireframe.
- A STEP with no sub-assembly gives a single assembly holding every body, with no joint. A GLB or an STL gives an assembly holding one body.

## Units, up axis and frames

- **Units.** A STEP and a GLB carry their own unit: nothing to choose. For an STL, the form asks for the **Unit** (m, mm, cm or inches). Pick the one of your export, otherwise the part appears a thousand times too large or too small.
- **Up axis.** For a GLB or an STL, the form offers **Y up (glTF standard)** or **Z up (CAD)**. Choose the value that matches your export. For a STEP the option is not offered: a converted STEP is always Z up.
- **Each assembly keeps its CAD frame.** The origin and axis of a joint are expressed in the frame of the parent assembly. If a cylinder is mounted tilted in the machine, its rod therefore slides along **its own** axis, not along the world axis.

### Placing the part so that motions follow the CAD axes

When you can, draw motions along the CAD axes: a motion aligned on X, Y or Z is easy to read and set.

For the other cases, the joint's **Take the axis from a face** button reads the axis of a cylindrical or plane face of the 3D view. It is offered only for an already saved joint whose type moves (not **Fixed**); see [Panels and buttons](/en/reference/panels). For a body coming from a STEP, it gives the axis of the face. For an STL or a GLB it only gives the normal of the triangle you aim at.

### Align the frame of each moving sub-assembly with its motion

In your CAD software, orient the frame of each **moving** sub-assembly along its motion: one axis along the rails of a slide, or along the axis of a pivot.

Why: the default axis of a joint is the `[0, 0, 1]` axis of the parent assembly's frame, and the viewer shows that frame. With an aligned frame, the default axis, the **Assembly's own axes** gizmo and the limits read directly. Otherwise you type the axis by hand or pick it on a face, and its numbers are hard to read.

Example: a carriage on slides tilted at 70°, whose sub-assembly frame is not tilted. The slide axis becomes something like `[0.94, 0, 0.34]` instead of `[0, 0, 1]`.

If you cannot change the CAD file:

1. Turn the fixed joint into **Prismatic (slider)**, then click **Apply**.
2. Click **Take the axis from a face**, then click a cylindrical face of the rod or a plane face of the rail. Click **Apply**.
3. Click **Align the frame on this axis**. The frame of the parent's assembly and that of the moved group turn so that the axis reads `[0, 0, 1]`. Nothing moves.

These buttons are offered only for a saved joint whose type moves; see [Panels and buttons](/en/reference/panels) and [In which frame a joint is read](/en/guide/model#in-which-frame-a-joint-is-read). The other joints of the same parent are rewritten too: group the rails first to keep a small parent.

## Bought parts

A bearing, cylinder or motor from a catalogue often arrives as a STEP with dozens of inner parts. **Leave it as is, as a sub-assembly**: it becomes a rigid group, with no joint to create inside. A bearing of about twenty parts gives one assembly and a single fixed joint to its parent.

If those inner parts clutter the tree, it is only a matter of comfort: the model is correct.

Special case: a component part of which moves (the cylinder above). Split it into two sub-assemblies if your CAD allows it, otherwise use **Group…** after the import.

## Names

The names of your assemblies and parts become **names and tag keys** in Pantin. An assembly's key is derived from its name and made unique in the Pantin. It prefixes the tags of its joints (`assembly.key.member`, see [Tags](/en/guide/tags)). These tags appear in the PLC program.

- Give **short, meaningful** names (`Rod`, `Carriage`, `Barrel`) rather than references (`ID1S0400125E_0:1`).
- Avoid duplicates between sibling assemblies.
- Rename in the CAD before the import rather than after. Renaming an assembly later changes its tags, and the PLC's GVL must then be regenerated.

Pantin reads the instance name first, as the converter reads it. Check the names in the tree after the import.

## When the file cannot be reorganised

You do not always control the CAD (supplier part, frozen file). Import as is, then structure in the viewer:

- **Group…** gathers chosen bodies into a sub-assembly, linked by a fixed joint;
- **Ungroup** undoes a group that is too large or badly cut;
- moving a body from one assembly to another fixes a wrong filing.

The procedures, the possible refusals and the screenshots are in [Group, ungroup, move a body](/en/guide/groups).

## Checklist before export

1. One sub-assembly per kinematic group: everything that moves together is filed together.
2. Bought parts stay as sub-assemblies, not exploded into the machine's assembly.
3. Assembly and part names are short, meaningful and without duplicates.
4. The model contains solids (not only surfaces), with no scaled or mirrored instance.
5. Motions follow the CAD axes when possible, and the frame of each moving sub-assembly is aligned with its motion.
6. Format: STEP preferably. For a GLB or an STL, one moving part per file, and note the unit and the up axis.

## What next

- [The model of a Pantin](/en/guide/model): the notions of body, assembly, group and joint.
- [Tutorial](/en/guide/tutorial): import a model and animate it step by step.

::: warning Known limits
- The full path from a given CAD software to Pantin, with the right pivots, has not been tried on a real part.
- How each CAD software names sub-assemblies in a STEP is not known for all of them.
- Very large assemblies (several hundred parts) have not been measured: each joint created validates the whole document, and the STEP conversion stops after 2 minutes.
:::
