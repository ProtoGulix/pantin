# 0028. Drives and actuators: the PLC drives the drive, the drive feeds the actuator

- Status: proposed
- Date: 2026-09-30
- Amends: ADR 0022 (points 3, 4, 5 and 6: drive types, drive document, joint setpoint, behaviour)
- Extends: ADR 0022 (one folder per type), ADR 0019 (tag keys), ADR 0025 (stateful step)

## Context

ADR 0022 fuses two devices into one drive type: `double_acting_cylinder`
is a cylinder and the valve that commands it. The user, an automation
engineer, found this wrong on 2026-09-30:

- What a PLC program commands is the valve, the contactor or the variable
  speed drive, not the cylinder or the motor. In French automation terms,
  the former is the "préactionneur", the latter the "actionneur".
- Real machines combine them freely: a double-acting cylinder behind a 5/2
  single or double solenoid valve, or a 5/3 valve with closed, exhausted or
  pressurised centre; a motor behind a contactor, a reversing contactor or
  a variable speed drive. Fused types multiply as valves times cylinders.
- Each valve has its own behaviour on loss of signal (spring return or
  memory) and when both coils are set; the cylinder does not change.

Facts checked in the repository on 2026-09-30:

- ADR 0022 point 6: a double-acting cylinder with neither or both coils set
  holds its position. Mid-stroke, this is a 5/3 closed-centre valve, not a
  5/2 double solenoid valve, which keeps pushing.
- `motor_analog` and `motor_on_off` carry an acceleration: a ramp, which is
  a setting of the variable speed drive, not of the motor. Their speed
  setpoint and feedback are in the joint's unit.
- `servo_axis` has no feedback tag.
- `PANTIN_SCHEMA_VERSION` is 8.

Facts from valve manufacturers' documentation (ASCO/Emerson catalogues of
ISO 5599/1 valves, consulted 2026-09-30): port 1 is the supply, 2 and 4 the
working ports, 3 and 5 the exhausts; pilot 14 is the main command and 12
the return; a single solenoid sits on the 14 side. By the ISO numbering
rule, pilot 14 connects 1 to 4 and pilot 12 connects 1 to 2. Manufacturers
also sell double 3/2 valves (two independent 3/2 in one body). NOT VERIFIED
against the text of ISO 5599 itself; the pilot number of a single 3/2 valve
(12, by the same rule) is NOT VERIFIED in a catalogue.

In English, "drive" already names the device a PLC commands (variable
speed drive, servo drive). The code keeps `drive` for it and adds
`actuator`; only the French labels change.

Loads fed back from the actuator to the drive (overcurrent on a stalled
motor, a cylinder pushed back by a load) are left for a later ADR.

## Decision

1. **Two entities.** A drive ("préactionneur") owns the PLC tags: command
   tags, feedback tags, its state (spool position, contactor closed, ramped
   speed) and the `unresponsive` fault. An actuator ("actionneur") has no
   tags: it reads drive outputs and moves joints. `jammed` stays a fault of
   a joint (ADR 0022 point 7).
2. **Ports on both sides.** A drive type declares named output ports, each
   of one domain; an actuator type declares named input ports, each of one
   domain. An actuator's feed maps each of its input ports to one output
   port of one drive, of the same domain. Names:

   | Domain | Drive output ports | State at each step |
   | --- | --- | --- |
   | `pneumatic` | ISO working ports `port_2`, `port_4` | `pressure`, `exhaust` or `blocked` |
   | `ac_power` | `out` | direction (-1, 0, 1) and speed ratio (0 to 1) |
   | `servo` | `out` | position setpoint, max speed, max acceleration |

   | Actuator type | Input ports | Default feed on creation |
   | --- | --- | --- |
   | `double_acting_cylinder` | `cap` (extends), `rod` (retracts) | `cap` ← `port_4`, `rod` ← `port_2` |
   | `single_acting_cylinder` | `cap` | `cap` ← `port_2` of a 3/2, `port_4` of a 5/x |
   | `ac_motor` | `in` | `in` ← `out` |
   | `servo_motor` | `in` | `in` ← `out` |

   A double-acting cylinder therefore cannot be fed by a 3/2 valve alone:
   its `rod` port would have no source. Swapping the two feeds, as swapping
   two tubes on a machine, reverses the cylinder. Port states are data in
   `@pantin/drive-types` (no logic), so the protocol and
   `@pantin/actuator-types` may import them.
3. **A package per side.** `@pantin/drive-types` keeps one folder per drive
   type (ADR 0022 point 1); its behaviour answers port states and feedback,
   never joint positions. A new `@pantin/actuator-types` follows the same
   layout (`schema.ts`, `behaviour.ts`, `labels.ts`, registries); its
   behaviour takes the states of its input ports and its joints and answers
   their next positions and velocities. The protocol imports the schemas of
   both; `actuator-types` imports the port state schemas of `drive-types`,
   never its behaviours. Dependency-cruiser enforces it.
4. **First drive types.** Variants stay types, so tags stay data. Coils are
   named after their pilot port; pilot 14 puts `port_4` under pressure and
   `port_2` to exhaust, pilot 12 the reverse. In a double 3/2 valve, each
   coil commands only its own port: `coil_14` puts `port_4` under pressure
   or to exhaust, `coil_12` does the same for `port_2`.

   | Type | Command tags | Rest (no coil) | Both coils |
   | --- | --- | --- | --- |
   | `valve_3_2_single` | `coil_12` | spring: `port_2` exhaust | n/a |
   | `valve_double_3_2` | `coil_14`, `coil_12` (one per valve) | spring: both exhaust | each valve on its own |
   | `valve_5_2_single` | `coil_14` | spring: pilot 12 position | n/a |
   | `valve_5_2_double` | `coil_14`, `coil_12` | keeps position | keeps position |
   | `valve_5_3_closed` | `coil_14`, `coil_12` | centre: both blocked | keeps position, diagnostic |
   | `valve_5_3_exhaust` | `coil_14`, `coil_12` | centre: both exhaust | keeps position, diagnostic |
   | `valve_5_3_pressure` | `coil_14`, `coil_12` | centre: both pressure | keeps position, diagnostic |
   | `contactor` | `run` | open | n/a |
   | `reversing_contactor` | `forward`, `reverse` | open | keeps the first closed (interlock) |
   | `vfd_on_off` | `run`, `reverse` | ramp to 0 | n/a |
   | `vfd_analog` | `speed_setpoint` | ramp to 0 | n/a |
   | `servo_drive` | `setpoint` | holds | n/a |

   A 5/3 valve with both coils set keeps its spool where it was (the user
   decided on 2026-09-30): in position 14 or 12 it stays there, in the
   centre it stays in the centre, and it moves again as soon as one coil
   falls. The drive raises the `conflicting_commands` diagnostic meanwhile
   (point 5).
5. **Diagnostics.** A drive type may report diagnostics: conditions its
   behaviour detects in the commands, as opposed to the faults a user
   injects. A diagnostic is runtime state, never saved, set and cleared by
   the behaviour at each step; it changes no port state by itself. It is not
   a PLC tag, since a real valve reports nothing: the core exposes it next
   to the drive's port states, read through the API (ADR 0029 point 8), and
   the viewer shows it on the drive. It becomes an event on the tag bus
   (CLAUDE.md section 9) once the tag bus exists. It tells the user that
   the PLC program commands something a real machine would not survive
   well. First diagnostic: `conflicting_commands`, on the three 5/3
   valve types.
6. **Units of drive tags.** A variable speed drive knows no motor: its
   `speed_setpoint` command and its `speed` feedback are percentages of the
   motor's nominal speed, and its acceleration is in percent per second.
   `vfd_analog` works in signed percent, from -100 to 100, the sign giving
   the direction (as `motor_analog` accepts a signed setpoint today);
   `vfd_on_off` reports 0 to 100, its direction coming from the `reverse`
   bit. The nominal speed, in the joint's unit, belongs to `ac_motor`. The
   existing `quantity` field of a drive tag (`position`, `speed`) gains the
   value `percent`, and the parameter kinds (`speed`, `acceleration`, in the
   joints' unit) gain `percent_per_second` for the ramp, so that clients
   show the right unit. A servo drive's setpoint, feedback, max speed and
   max acceleration are in the unit of the joints it moves in the end;
   every actuator it feeds must move joints of one unit.
7. **Drive feedback.** A variable speed drive reports its own ramped output
   (an open-loop drive shows its output frequency, not the shaft's speed).
   A servo drive reports the position of the joints it moves as they were
   at the end of the previous step, one step (1/120 s) late, as a drive
   reads its motor encoder; a jammed joint therefore shows in its feedback.
   When it moves several joints, it reports the position of the joint
   furthest from its setpoint, so that one jammed joint among several stays
   visible (the first joint by id would hide it).
   The core passes those positions to the drive's step; this is the only
   information flowing back from actuators to drives in this ADR.
8. **First actuator types.**

   | Type | Parameters | Behaviour |
   | --- | --- | --- |
   | `double_acting_cylinder` | extend speed, retract speed | `cap` pressure and `rod` exhaust extends; the reverse retracts; both blocked holds; both pressure extends (rod area difference); both exhaust holds (no load model yet) |
   | `single_acting_cylinder` | extend speed, return speed | `cap` pressure extends; `cap` exhaust returns; `cap` blocked holds |
   | `ac_motor` | nominal speed | turns at direction × ratio × nominal speed |
   | `servo_motor` | none | follows the setpoint within the drive's limits |

   A contactor gives the full ratio at once: the motor has no inertia until
   loads are modelled.
9. **Document.** `pantin.json` gets `actuators`: id, name, `assembly`, its
   feed (for each input port, a drive id and an output port), the ids of the
   joints it moves, and its type's fields. Drives lose their joint ids.
   Rules:
   - the feed is optional, but when present it covers every input port,
     from ports of one drive, of matching domains; an actuator without feed
     holds its joints where they are;
   - the joint list may be empty; a joint is moved by one actuator at most;
     an actuator's joints share their unit;
   - one drive output port may feed several actuators;
   - a new feed replaces the previous one.
   Tags stay `<assembly>.<tagKey>.<member>`, on drives only. A joint's
   `setpoint` tag exists only while no actuator moves it (replaces ADR 0022
   point 5).
10. **API.** Actuators are created, updated and deleted through REST routes
   like drives (`.../actuators`, `.../actuators/:actuatorId`). The
   `unresponsive` fault stays on `PUT .../drives/:driveId/fault`. Deleting a
   drive that feeds an actuator is refused, as deleting a driven joint.
11. **Step order**, at 1/120 s, each list in id order: drives (commands to
    port states and feedback), then actuators (port states to joints), then
    sensors (ADR 0025). A drive's `unresponsive` fault freezes its port
    states and feedback as in ADR 0022.
12. **Migration to schema version 9.** Each ADR 0022 drive becomes a drive
    and an actuator with the same tag key, fed with the default feed of
    point 2:

    | ADR 0022 type | Drive | Actuator | Changes seen by the PLC |
    | --- | --- | --- | --- |
    | `double_acting_cylinder` | `valve_5_3_closed` | `double_acting_cylinder`, `speed` → both speeds | `extend` → `coil_14`, `retract` → `coil_12` |
    | `single_acting_cylinder` | `valve_3_2_single` | `single_acting_cylinder`, `speed` → both speeds | `extend` → `coil_12` |
    | `motor_on_off` | `vfd_on_off`, acceleration → % of nominal speed per s | `ac_motor`, nominal speed | `speed` in % |
    | `motor_analog` | `vfd_analog`, idem | `ac_motor`, nominal speed = 1 unit per s | `speed_setpoint` and `speed` in % |
    | `servo_axis` | `servo_drive`, max speed and acceleration | `servo_motor` | new `position` feedback |

    Motion is unchanged for every type but two cases:
    - a double-acting cylinder whose two coils are set while it moves
      stopped under ADR 0022 and now goes on, with the
      `conflicting_commands` diagnostic (point 4);
    - `motor_analog` has no maximum speed to derive a nominal speed from.
      With the nominal speed at 1 unit per s, a setpoint of v units per s
      becomes 100 × v %, so the PLC sends 50 where it sent 0.5; a setpoint
      above 1 unit per s saturates at 100 % until the user sets the real
      nominal speed. No tag consumer exists before phase 7 (the PLC
      bridge), so this has no practical effect today.

    The tags seen by the PLC change as listed. The JSON Schema is
    regenerated (ADR 0021).
13. **Viewer.** The right-hand panel shows "Préactionneurs" (with their
    tags) and "Actionneurs" (with their feed and joints); the English labels
    are "Drives" and "Actuators". The joint arrow of ADR 0022 shows the
    actuator that moves the joint. Creating an actuator offers only drives
    whose ports match its input ports.

## Rejected alternatives

- Keeping fused types: one type per valve and cylinder pair, and the
  valve's behaviour copied into each.
- The valve as an option of the cylinder type: its tags would depend on a
  parameter, which ADR 0022 rejects.
- One domain per port count (`pneumatic_1`, `pneumatic_2`): it prevents a
  3/2 on a double-acting cylinder, but not a swapped tube, and says nothing
  of which port drives which chamber.
- Feeding one actuator from several drives (two separate 3/2 valves on one
  cylinder): the double 3/2 valve type covers the real case, and a single
  source keeps the chain diagram a forest (ADR 0029).
- A variable speed drive holding the motor's nominal speed, so that the PLC
  keeps joint units: the same value in two places, and not what a PLC sends
  a real drive.
- Physical ports (pressure and flow, voltage and current) as in bond graphs:
  needed for loads and air consumption, far more than the discrete
  behaviours asked for now. The port states can grow into it.
- Actuators with their own tags (a motor's thermal contact): feedback
  devices are sensors, or the drive's feedback.

## Consequences

- A new valve or starter is one drive type folder, usable with every
  actuator whose ports match; valves are table-like and good candidates for
  docs/backlog/declarative-drives.md.
- CLAUDE.md is updated: section 4 (packages list, the protocol's exception
  now covers `actuator-types`), section 5.3 (drives and actuators instead
  of three drive modes), and the dependency-cruiser rules.
- docs/guides/adding-a-drive-type.md is rewritten and a guide for actuator
  types is added.
- ADR 0022 gets "Partly superseded by: ADR 0028" once this ADR is accepted.
- The phase 4 exit test runs through the migration with unchanged motion,
  then again with each valve type.
- This reworks phase 4. It must land before phase 7 (the PLC bridge), when
  tag names start to matter; doing it before phase 6 is to be decided.
- To decide: the exhausted cylinder holding until loads exist; whether a
  5/2 double solenoid valve and a reversing contactor also raise
  `conflicting_commands`.
- Next ADR: loads and faults flowing back from actuators to drives
  (overcurrent, air loss, a cylinder pushed back).
