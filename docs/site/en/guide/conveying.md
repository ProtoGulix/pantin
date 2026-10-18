# Products and conveying

This page describes the objects that carry and detect products. They rely on the action chain: see [Drives, actuators and sensors](/en/guide/action-chain).

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
