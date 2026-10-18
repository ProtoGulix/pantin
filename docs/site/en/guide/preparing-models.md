# Preparing 3D models

This page explains how to prepare your files **in your CAD software, before the import**. A few minutes of organisation there save most of the work in the viewer. The words **body**, **assembly** and **group** are defined in [The model of a Pantin](/en/guide/model#concepts-body-assembly-group).

## The golden rule: one sub-assembly per kinematic group

**Put everything that moves together in the same sub-assembly.**

A kinematic group is a set of parts that move as one block. In a cylinder, the barrel is on one side; the rod and its rod end, which extend and retract together, are on the other. That makes two groups, so two sub-assemblies:

```
Cylinder                       root assembly
├── Barrel                     sub-assembly: stays in place
│   └── barrel
└── Rod                        sub-assembly: extends and retracts
    ├── rod
    └── rod end
```

### Why

When a STEP is imported, each sub-assembly becomes a Pantin **assembly** and each part a **body** ([ADR 0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md), [ADR 0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md)). The bodies of an assembly stay stuck to it, with no joint to create. The import creates one **Fixed** joint per sub-assembly, from the parent group to the child group. To animate the rod, you simply turn that fixed joint into a **Slider**.

If the sub-assembly does not exist in the file, you have to build it yourself after the import with **Group…** (see below). It works, but doing it once in the CAD is faster.

### Examples seen in practice

These two cases come from the project's trials, described in generic terms.

- **A supplier's cylinder**, exported as STEP: three parts filed in a single assembly, imported as three bodies in one assembly. Pantin cannot guess that the rod moves: either split the assembly in the CAD (barrel on one side, rod and rod end on the other), or use **Group…** after the import.
- **Another machine**, exported as STEP with ten assemblies: the import produced nine fixed joints between groups, one per child sub-assembly ([ADR 0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md), point 10 and the amendment "moving a body between groups (slice 3)" of 18 October 2026: checked with the real converter). Its 51 parts needed no joint inside their assemblies.

## Formats

| Format | What Pantin gets from it | Good to know |
| --- | --- | --- |
| **STEP** (`.stp`, `.step`) | The structure is kept: each sub-assembly becomes an assembly, each part a body. Everything is converted to metres. | The format to prefer. The conversion runs in a separate process and can take up to 2 minutes. |
| **GLB** (glTF) | One file gives **one body**. | The nodes of the file are not split into several bodies for now (an idea recorded in the project backlog). Two parts that move separately must therefore be two files. |
| **STL** | One file gives one body. | No unit and no hierarchy: the import form asks for the **Unit**. |

### What the conversion of a STEP does

- Each part (leaf of the tree) becomes a body, in a GLB file in metres, Z up, at the place the assembly gives it: nothing moves compared to the CAD.
- Each sub-assembly becomes an assembly, at every level of the tree. A file with several roots gives an assembly named after the file.
- Parts with no faces to draw (wires, points, construction geometry) are ignored.
- A STEP with an assembly instance that is **scaled or mirrored** is refused: "The assembly "name" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances." Turn mirrored parts into real parts (the symmetric part drawn, no mirror instance) before export.
- A STEP with no solid at all is refused: export the model with its solids, not only surfaces or a wireframe.
- A STEP with no sub-assembly gives a single assembly holding every body, with no joint. A GLB or an STL gives an assembly holding one body.

## Units, up axis and frames

- **Units.** A STEP and a GLB carry their own unit: nothing to choose. For an STL, the form asks for the **Unit** (m, mm, cm or inches): pick the one of your export, otherwise the part appears a thousand times too large or too small.
- **Up axis.** The form offers **Y up (glTF standard)** or **Z up (CAD)**. For a STEP the option is shown but has **no effect**: a converted STEP is always Z up, like the CAD. For a GLB or an STL, choose the value that matches your export.
- **Each assembly keeps its CAD frame** ([ADR 0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md), point 4). The origin and axis of a joint are expressed in the frame of the parent assembly. If a cylinder is mounted tilted in the machine, its rod therefore slides along **its own** axis, not along the world axis.

### Placing the part so that motions follow the CAD axes

Draw motions along the CAD axes when you can: a motion aligned on X, Y or Z is easy to read and set. For the other cases, the joint's **Take the axis from a face** button reads the axis of a cylindrical or plane face of the 3D view ([ADR 0041](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0041-joint-axis-from-a-picked-face.md)). It is offered only for an already saved joint whose type moves (not **Fixed**); see [Panels and buttons](/en/reference/panels). It works for bodies coming from a STEP, which carry face files; for an STL or a GLB it only gives the normal of the triangle you aim at.

## Bought parts

A bearing, cylinder or motor from a catalogue often arrives as a STEP with dozens of inner parts. **Leave it as is, as a sub-assembly**: it becomes a rigid group, with no joint to create inside. The bearing of about twenty parts in one trial gives one assembly and a single fixed joint to its parent. If those inner parts clutter the tree, that is a known comfort point, not a flaw of the model.

Special case: a component part of which moves (the cylinder above). Split it into two sub-assemblies if your CAD allows it, otherwise use **Group…** after the import.

## Names

The names of your assemblies and parts become **names and tag keys** in Pantin: an assembly's key is derived from its name, made unique in the Pantin, and prefixes the tags of its joints (`assembly.key.member`, see [Tags](/en/guide/tags)). These tags appear in the PLC program.

- Give **short, meaningful** names (`Rod`, `Carriage`, `Barrel`) rather than references (`ID1S0400125E_0:1`).
- Avoid duplicates between sibling assemblies.
- Rename in the CAD before the import rather than after: renaming an assembly later changes its tags, and the PLC's GVL must then be regenerated.

::: warning Not verified
How a given CAD software names sub-assemblies and instances in a STEP is not verified for every software. Pantin reads the instance name first, as the converter reads it. Check the names in the tree after the import.
:::

## When the file cannot be reorganised

You do not always control the CAD (supplier part, frozen file). Import as is, then structure in the viewer:

- **Group…** gathers chosen bodies into a sub-assembly, linked by a fixed joint;
- **Ungroup** undoes a group that is too large or badly cut;
- moving a body from one assembly to another fixes a wrong filing.

The procedures, the possible refusals and the screenshots are in [Group, ungroup, move a body](/en/guide/groups).

## Checklist before export

1. One sub-assembly per kinematic group (everything that moves together is filed together).
2. Bought parts are left as sub-assemblies, not exploded into the machine's assembly.
3. Assembly and part names are short, meaningful and without duplicates.
4. The model contains solids (not only surfaces), with no scaled or mirrored instance (symmetric parts are real parts).
5. Motions follow the CAD axes when possible.
6. Format: STEP preferably. For a GLB or an STL, one moving part per file, and note the unit and the up axis.
7. A GLB or an STL is a single body: split into files what must move separately.

::: warning Not verified
The behaviour on very large assemblies (several hundred parts) is not measured: each joint created validates the whole document, and the STEP conversion is limited to 2 minutes. The full path from a given CAD software to Pantin with the right pivots has not been validated on a real part.
:::

## What next

- [The model of a Pantin](/en/guide/model): the notions of body, assembly, group and joint.
- [Tutorial](/en/guide/tutorial): import a model and animate it step by step.
