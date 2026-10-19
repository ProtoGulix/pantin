# Reading colours and cues

Every colour code also has an icon, a shape, an outline, a line style or a word: colour is never alone. The colours are chosen to stay readable by colour-blind users; where two colours stay close (axes in the light theme, diagram wires, conveyor volumes), the shape, line or label decides. The screen is grey by default and colour is kept for what matters, in the spirit of the ISA-101 standard for operator screens.

## One colour, one meaning

| Colour | Meaning, everywhere (3D, tree, diagram, panels) |
| --- | --- |
| Selection blue | Selected, focus, the side that moves, interface attention (unsaved changes, busy, link target). |
| Green | A signal on, an output energised, a bridge running, and nothing else. |
| Amber | Forced, warning. |
| Red | Error, failure, injected fault, invalid value. |
| Brand orange | Pantin itself: primary buttons, the active tab or view mode. Never a state. |
| Grey and text colours | Every other property (driven, watched, done, information). |

The Y axis is green, as in most CAD software. The letter **Y** at the end of the axis tells it apart from the "on" green.

## States: an icon beside the colour

| Cue (no colour) | Colour | State |
| --- | --- | --- |
| Check | green | Normal, correct, running |
| Warning triangle | amber | Warning |
| Cross in an octagon | red | Error, failure |
| Ring | neutral | Idle, off |
| Ring with its left half filled | selection blue | Busy, under way |
| Letter **F** beside a diagram socket; padlock and the word **forced** in the inspector | amber | Tag forced from the viewer |

These icons appear on the bridge status dot, the module lines, the I/O module list (which also writes the status word) and the journal badges.

### Journal badges

| Cue | Fill and outline | Level |
| --- | --- | --- |
| Circled i and word **Info** | no fill, muted text | Information |
| Triangle and word **Warn.** | amber, dark text | Warning |
| Cross in an octagon and word **Error** | red, white text | Error |

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

The label and the stroke identify a wire, not its colour. Pneumatic and observation, both bluish, differ by stroke, width and label.

## In the Joints view

Joints are **never** told apart by colour: all lines and signs share the same neutral tint. Each joint type has its own line style (thin solid, long dashes, thick solid, round dots, dash and dot), its sign in the middle (filled square, rectangle with a double arrow, arc with two end stops, circle with an arrow, thread) and its name. The selected item and its path to World are tinted **and** thickened, and the shape of the selected group grows to show its full name. The full list is in [The Joints view](/en/reference/views#the-joints-view).

## Conveyor volumes

| Volume | Cue (no colour) | Colour |
| --- | --- | --- |
| Emitter | Sign **+** on the volume, outlined translucent volume | Almost white (dark theme), almost black (light theme) |
| Absorber | Sign **−** on the volume, outlined translucent volume | Mid grey |
| Guide | Nearly solid body | Light bluish grey (dark theme), almost black (light theme) |
| Belt | Solid body | Dark grey (dark theme), almost black (light theme) |

::: warning Known limits
The selection outline has not been tried on every imported mesh.
:::
