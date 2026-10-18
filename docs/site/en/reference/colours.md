# Reading colours and cues

Every coding on screen can be read without colour: an icon, a shape, a fill or an outline, a line style or a word says the same thing. The colours were also chosen for colour-blind users: the pairs of codings shown together are registered and checked by tests, with a simulation of protanopia, deuteranopia and tritanopia. Where two colours cannot stay far enough apart (the axes in the light theme, the diagram wires, a signal on or off, the conveyor volumes, with measured gaps from 8 to 34), the test records the measured gap and the cue that takes over.

Pantin follows the principles of the ISA-101 standard for operator screens (grey by default, colour kept for what matters, never alone) without claiming conformance: the text of the standard was not read ([ADR 0057](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0057-colour-blind-safe-coding.md), [report 0010](https://github.com/ProtoGulix/pantin/blob/develop/docs/spikes/0010-isa-101-hmi-colour.md)). The visual identity (brand orange, two themes) does not change. This page describes what the code does; the exact shades are set in the themes.

## One colour, one meaning

| Colour | Meaning, everywhere (3D, tree, diagram, panels) |
| --- | --- |
| Selection blue | Selected, focus, the side that moves, interface attention (unsaved changes, busy, link target). |
| Green | A signal on, an output energised, a bridge running, and nothing else. |
| Amber | Forced, warning. |
| Red | Error, failure, injected fault, invalid value. |
| Brand orange | Pantin itself: primary buttons, the active tab or view mode. Never a state. |
| Grey and text colours | Every other property (driven, watched, done, information). |

One declared exception: the Y axis is green, as in most CAD software. The letter **Y** at the end of the axis tells it apart from the "on" green.

## States: an icon beside the colour

| Cue (no colour) | Colour | State |
| --- | --- | --- |
| Check | green | Normal, correct, running |
| Warning triangle | amber | Warning |
| Cross in an octagon | red | Error, failure |
| Ring | neutral | Idle, off |
| Ring with its left half filled | selection blue | Busy, under way |
| Letter **F** beside a diagram socket; padlock and the word **forced** in the inspector | amber | Tag forced from the viewer |

These 12 px icons appear on the bridge status dot, the module lines, the I/O module list (which also writes the status word) and the journal badges.

### Journal badges

| Cue | Fill and outline | Level |
| --- | --- | --- |
| Circled i and word **Info** | no fill, muted text | Information |
| Triangle and word **Warn.** | amber, dark text | Warning |
| Cross in an octagon and word **Error** | red, white text | Error |

Each filled badge has an outline that stays visible on the panel background.

## In the 3D view

| Element | Cue (no colour) | Colour |
| --- | --- | --- |
| Selected body | An outline | Blue tint |
| Joint preview, parent | Tint without outline | Yellow-orange |
| Joint preview, child (the body that moves) | Tint with outline | Blue |
| Swatches of the joint form | Disc for the parent, outlined square for the child | As above |
| Joint arrow | A collar (disc) at the base of the shaft when an actuator moves the joint | Blue, free or driven |
| Face alignment | Moving face outlined, target face without outline | Blue, yellow-orange |
| Sensor marker, light beam | On: thick and opaque. Off: thin and translucent | On green, off neutral |
| Axes X, Y, Z | The letters **X**, **Y**, **Z** at the end of the ground axes, the trihedron and the view cube | Red, green, blue, of different lightness |

In the tree, an active sensor is a filled disc, an inactive one a ring.

## In the chain diagram

Each kind of wire has its own stroke and a label written on the wire:

| Label | Kind | Stroke | Colour |
| --- | --- | --- | --- |
| **PNEU** | Pneumatic | Long dashes, 1.5 px | Light blue (dark theme), medium saturated blue (light theme) |
| **AC** | AC power | Solid, 2.5 px | Almost white (dark theme) or almost black (light theme) |
| **SERVO** | Servo | Dotted, 2 px | Mauve (dark theme), very dark plum (light theme) |
| **MECH** | Mechanical | Solid, 1.5 px | Light grey (dark theme), dark grey (light theme) |
| **OBS** | Observation | Dash-dot, 1 px | Medium blue-violet (dark theme), indigo close to violet (light theme) |

The label and the stroke identify a wire, not its colour. No wire takes the amber, red or green of the states, or the Pantin orange. Pneumatic and observation, both bluish, differ only by stroke, width and label.

## Conveyor volumes

| Volume | Cue (no colour) | Colour |
| --- | --- | --- |
| Emitter | Sign **+** on the volume, outlined translucent volume | Almost white (dark theme), almost black (light theme): the grey farthest from the ground |
| Absorber | Sign **−** on the volume, outlined translucent volume | Mid grey, the nearest the ground that the 3:1 rule allows |
| Guide | Nearly solid body | Light bluish grey (dark theme), almost black (light theme) |
| Belt | Solid body | Dark grey (dark theme), almost black (light theme) |

The **+** and **−** signs are drawn with a halo, legible on any grey.

## What is not verified

- The visibility of the selection outline on every imported mesh.
- How the colours look on a real screen: the measurements are computed on colour-blindness simulations (Machado 2009), not with people.
