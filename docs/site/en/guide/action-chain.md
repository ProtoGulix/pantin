# Drives, actuators and sensors

This page describes the chain that animates the joints: a **drive** receives the PLC's commands, an **actuator** moves the joints, a **sensor** reads the result. Neither is a 3D part. Joints are in [The model of a Pantin](/en/guide/model#joints).

Neither the drive nor the actuator is a 3D part. Together, they turn a PLC command into motion.

## Drives

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

## Actuators

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
