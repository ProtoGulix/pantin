# Central views

The central area of the viewer shows the machine in three forms: the **3D view**, the **chain diagram** and the **I/O view**. They combine into four layouts. Keys and mouse are in [Keyboard and mouse shortcuts](/en/reference/shortcuts); the menus in [Menus](/en/reference/menus); the other panels in [Panels and buttons](/en/reference/panels).

## The four layouts

| Layout | What it shows | How to get it |
| --- | --- | --- |
| **3D only** | The 3D view takes up the whole area. | **3D** button of the toolbar, **View** menu |
| **Chain diagram only** | The diagram takes up the whole area. | **Diagram** button, **View** menu |
| **3D + Diagram** | The 3D view on top, the diagram below. This is the default layout. | **3D + Diagram** button, **View** menu |
| **I/O alone** | The I/O list (modules, channels, unmapped tags). | **View** menu, **I/O config** button of the **PLC bridge** card, or **Show in I/O** |

The **F4** key cycles through **3D + Diagram**, **3D only** and **Chain diagram only**. It never goes through **I/O alone**: from that view, it goes back to **3D + Diagram**.

In the **3D + Diagram** layout, a horizontal handle separates the two views (**Resize the 3D view and the diagram**). Drag it to change the split; a double-click restores it. The split is kept in the browser. So is the chosen layout.

Changing layout keeps the 3D camera, the diagram's scroll position and the fields being typed in stay.

With no Pantin open, only the empty 3D view is displayed, under the [welcome window](/en/reference/panels#the-welcome-window).

## The 3D view

The 3D view draws the machine from the positions that the core sends continuously.

Under the view, a help line reminds the mouse gestures according to the chosen navigation preset (**Mouse: SolidWorks** or **Mouse: ZW3D**).

### Navigating

| Gesture | Effect |
| --- | --- |
| Rotation, pan, zoom with the mouse | Depend on the preset chosen in **View**: **Mouse: SolidWorks** or **Mouse: ZW3D**. The left button has no camera action: it selects. |
| Wheel | Zooms. The **Reverse wheel direction** entry of the **View** menu changes the direction. |
| Keyboard arrows | Turn the camera by steps. The step size is set by the **Arrow step** entry of the **View** menu. The focus must be on the view (click in it). |
| **Perspective** (**View** menu) | Checkbox: turns the camera's perspective on or off. |

The exact differences between the two presets (which button does what, with which keys) are in [Shortcuts](/en/reference/shortcuts).

### The view cube

![The view cube, at the top right of the 3D view](/screenshots/en/view-cube.webp)

The cube turns with the camera and lets you look at the machine from a precise direction, with one click.

| Cube element | Effect of the click |
| --- | --- |
| A face (named **Front**, **Back**, **Left**, **Right**, **Top**, **Bottom**) | The camera turns to that standard view. |
| An edge or a corner | The camera turns to that oblique direction. |
| Hovering | Lights up all the cube cells that ask for the same view. |

The camera turns in 300 ms. After a click, the keyboard goes back to the view: the arrows keep turning the camera. Three axes come out of the cube and follow its orientation.

### Standard views

Seven standard views exist: **Front**, **Back**, **Left**, **Right**, **Top**, **Bottom**, **Isometric**. There are three ways to choose them:

- click a face of the view cube;
- press **Space** (focus on the view or the page, not on a button, the tree or the diagram): a list of views appears at the pointer's position, with the up and down arrows and **Esc** to close;
- the shortcut keys, given in [Shortcuts](/en/reference/shortcuts), or the **View** menu.

### Framing

**Frame all** (**View** menu, **Frame all** button) places the camera to see all the bodies. **Frame selection** (button, menu, or **Frame the view on this item** in the tree's context menu) places it on the selected element. Both are greyed out without a body, and in a layout without a 3D view.

### Selecting

The selection is shared between the 3D view, the tree and the diagram: what you select in one is highlighted in the others and described in the inspector.

| Gesture in the 3D view | Effect |
| --- | --- |
| Click on a body | Selects the top-level assembly that contains it. |
| Another click on the same body (double-click) | Goes down one level into the sub-assemblies, down to the body itself. |
| Click on a belt, a guide, an emitter, an absorber or a presence sensor | Selects the object, provided no body is in front. |
| Click in empty space | Deselects. While a placement tool is active, this click is ignored so as not to lose the assembly the tool is working on. |
| Drag with a camera button | Turns or pans the camera, and never selects. |

A selected body or assembly takes a blue tint and an outline. For a selected joint, the parent is yellow-orange and the child (the body that moves) is blue and outlined, like the markers of the [joint form](/en/reference/panels#new-joint). An arrow shows the joint's axis and positive direction. All colours and cues are in [Reading colours and cues](/en/reference/colours).

### Sensors in the view

Each joint sensor is drawn in the view: a thick stretch of the axis for a range sensor, an arc for a pivot, a ring otherwise. It lights up (green, thicker and opaque) when its state tag is 1 and stays neutral, thin and translucent at 0; see [Reading colours and cues](/en/reference/colours).

### Hiding and isolating

In an assembly's context menu, or with the tree's eye:

| Action | Effect |
| --- | --- |
| **Hide in the 3D view** / **Show in the 3D view** | Hides or shows the assembly and its sub-assemblies. |
| **Isolate in the 3D view** | Keeps only this assembly (and its sub-assemblies) visible. |
| **Show every assembly** | Undoes the isolation. |

This display is never saved in the Pantin: it goes back to zero on the next opening. The simulation is not affected: a hidden assembly keeps moving and detecting.

### The placement gizmo

The gizmo is a three-axis handle that you drag to place an assembly. It exists only if a single assembly is selected, the 3D view is displayed and the inspector is open. If one of these conditions goes away, the tool turns off.

| Control (inspector toolbar or **Edit** menu) | Effect |
| --- | --- |
| **Move (G)** | Translation handles. |
| **Rotate (R)** | Rotation handles. |
| **Assembly's own axes (L)** / **Anchor's axes (L)** | Chooses the gizmo's axes: those of the assembly or those of its support. |
| Step field | Snapping of the drag, in mm or degrees. **Ctrl** held during the drag: no step. |
| **Esc** during a drag | Restores the placement from the start of the drag. |
| **Restore the previous placement** | Gives back the placement kept before the last change. |

While you drag, the **X**, **Y**, **Z**, **RX**, **RY**, **RZ** fields of the inspector show the current value. The bodies move on screen once the core has accepted the placement: only the gizmo moves during the drag.

### Alignment by faces

**Align (A)** places an assembly relative to another by picking faces. The **Align "name"** block of the inspector lists the picks to make; each pick is a click on a face of the 3D view. The picked faces are tinted.

| Type | Picks asked |
| --- | --- |
| **Plane on plane** | A plane face of the moving part, a plane face of the target |
| **Axis on axis** | A hole or a shaft of each part |
| **Axis on axis about a pivot** | A pivot on the target (a hole already aligned), another hole of the moving part, a hole of the target opposite |

The moving part is the selected assembly. The target's faces must belong to a part that stays in place. During the alignment, a click in the 3D view is a pick, not a selection. The block's controls are described in [Panels and buttons](/en/reference/panels#the-positioning-section-and-alignment).

::: info Body without a faces file
If a body has no faces file, the alignment can only aim at a triangle's plane, never an axis (the console reports it).
:::

### Moving a joint by hand

The **Position of "name"** slider of the inspector, for a moving joint, moves the joint while you hold it. The bodies move in the 3D view as if an actuator were pushing them; the value is in mm or degrees. It is an editing gesture, useful to check the limits and the axis.

## The chain diagram

![The chain diagram: valve, cylinder, joint and sensors](/screenshots/en/diagram.webp)

The diagram draws the machine's action chain: what the PLC commands, what that moves, what watches it. It reads the same tags as the inspector and lights up in real time.

### Structure

The diagram is split into **bands**, one per assembly. Each band is foldable. The elements are arranged in it in four **columns**, from left to right:

| Column | Content |
| --- | --- |
| **Drives** | Valves, contactors, variable speed drives. |
| **Actuators** | Cylinders, motors. |
| **Joints** | The moving joints that are moved or watched. Fixed joints are not drawn. |
| **Sensors** | Joint sensors. |

The column header stays at the top when the diagram scrolls. An element placed in a band other than that of its assembly bears a badge with the name of that **Assembly**.

| Control | Effect |
| --- | --- |
| Band button (chevron and name) | Folds the band to its header alone (**Collapse assembly name**) or unfolds it (**Expand assembly name**). A folded band has neither node nor link. |
| **+** at the head of the **Drives**, **Actuators**, **Sensors** columns | Opens the matching creation form in the inspector (**New drive**, **New actuator**, **New sensor**). |
| **Joints** column header | No **+**: a joint links two bodies, it is created from the tree (**New joint…**). The tooltip says so. |

When the Pantin has no element yet, the diagram says: **No chain to show yet. Add a drive, an actuator or a sensor with the + buttons above.**

### Nodes

A node is a box with its name, its type and its **connectors** (small circles with their name).

| Node | Connectors |
| --- | --- |
| Drive | On the left, its command tags (what the PLC writes). On the right, its output ports. |
| Actuator | On the left, its input ports. On the right, a link to the joints it moves. |
| Joint | A link from the actuator, a link to the sensors. |
| Sensor | A link to the watched joint, and its feedback tags (read-only value). |

A click on a node selects it: a drive, an actuator or a sensor is shown in the inspector; a joint selects its row in the tree. The selected node's chain stays in full colour, the rest fades, and the linked nodes are marked. Selecting an element elsewhere (tree, 3D view) highlights it here.

### Links

A link joins two connectors. There are five kinds, named in the tooltips and for screen readers: **Pneumatic link**, **AC power link**, **Servo link** (from a drive to an actuator), **Mechanical link** (from an actuator to a joint) and **Observation link** (from a sensor to a joint). Each kind has its own line style and a label written on the wire: **PNEU**, **AC**, **SERVO**, **MECH** and **OBS** (see [Reading colours and cues](/en/reference/colours#in-the-chain-diagram)).

A click on a link selects it and makes a small **×** appear halfway along. Clicking the **×** removes the link. For an observation link, the **×** is greyed out: a sensor always watches a joint, it is **moved** by dragging its link onto another joint.

### Linking two elements

There are two ways to wire, with the same rules:

**With the mouse.** Press the starting connector (a drive output, an actuator's output, or a sensor's wire) and drag. During the drag, a line follows the pointer; the connectors where the link is allowed light up, those where it would be refused fade. Release on the target to create the link. **Esc** cancels the drag. A move of less than four pixels is a simple click.

**With the keyboard, using Link to….** On a power connector, **Enter** opens a small **Link to…** menu that lists the possible targets (`node name · connector name`). **Enter** links, **Esc** closes it and gives the focus back to the connector. An existing link is removed through the **Remove link to…** menu.

If the link is refused, the reason is shown in the message line:

| Reason | Message |
| --- | --- |
| Different domain | **Port … does not carry what input … reads.** |
| Already done | **Already linked this way.** |
| Incomplete feed | **… cannot feed every input of ….** |
| Fixed joint | **Joint … is fixed: no actuator can move it.** |
| Joint already moved | **Joint … is already moved by ….** |
| Different units | **Joint … is not in the same unit as the joints of … (metres or degrees).** |
| Sensor without a joint | **A sensor always watches a joint: drag its link onto another joint instead of removing it.** |
| Not applicable | **These two cannot be linked.** |
| Edit in progress | **Another edit is in progress: try again in a moment.** |

Replacing the feed of an actuator that is already fed by another drive first goes through the **Replace** / **Cancel** confirmation.

### Live values

The diagram is updated four times a second from the tags and the state of the drives.

| What lights up | When |
| --- | --- |
| A command or feedback connector | Its tag is at 1. |
| A pneumatic port and its links | It is under pressure (**under pressure**). Not when it is exhausted or blocked. |
| An AC power port and its links | The running direction is not zero (**powered**). |
| A servo port | Never: it is a setpoint, not a flow. The movement is seen on the joint, in 3D, and on the feedback tag. |
| Mechanical and observation links | Never. |

An alert accompanies a drive with a diagnostic: the node is outlined and the short name of the diagnostic is written under the box, for example **⚠ Conflicting commands**. The tooltip and the accessible name give the full text.

### Forcing a command from the diagram

![A coil forced from the diagram, with its F mark](/screenshots/en/forced-tag.webp)

The command connectors on the left of a drive are buttons. They write the tag as the PLC would, with the same rules as the inspector.

| Gesture | Effect |
| --- | --- |
| Click (or **Space**) on a boolean command | Toggles it: it goes from 0 to 1 or from 1 to 0. |
| Click (or **Enter**) on a numeric command | Opens a small field next to the connector, with the unit (mm/s, degrees...) and the current value selected. **Enter** sends; **Esc**, or leaving the field, closes without writing. Text that is not a number keeps the field open, marked (**Type a number**). Scrolling the diagram closes the field. |
| **F** mark next to the connector | It appears while the tag is forced: the PLC cannot write it. The tooltip says **Forced: tag name**. |
| **Menu** key on a forced connector (keyboard) | Opens a one-entry menu, **Release** (title **Forced tag**), which gives the tag back to the PLC. |

A click on a command connector does not select the node: the inspector does not jump during a test.

### On the keyboard

The diagram can be navigated entirely from the keyboard: the arrows move from node to node, **Enter** goes into a node's connectors, **Space** selects the node (or toggles a boolean command), **Esc** goes back, **Home** and **End** go to the first or last node, **Del** removes the link of a connector or the selected link, **F2** renames a drive, an actuator or a sensor. The detail is in [Shortcuts](/en/reference/shortcuts). **Del** never deletes an element: for that, use the **Edit** menu. If you press it on a node, the message line reminds you.

## The I/O view

![The I/O view with module m1, its settings and the channel table](/screenshots/en/io-view.webp)

The I/O view is the editor of the Pantin's input/output list (`io.json`): which tags are given to the PLC, on which Modbus module, at which address. It replaces the 3D view and the diagram. What it writes is saved and undone with the Pantin, like the rest.

::: info A list for the PLC
The modules here are those that the bridge presents to the PLC (see [Connect a PLC](/en/guide/connect-a-plc)). The **Export GVL** button produces the matching CODESYS variable list.
:::

### The states of the view

| State | What is displayed |
| --- | --- |
| Reading | **Reading the I/O list…** |
| No list | **This Pantin has no I/O list (io.json) yet.** and the **Create the mapping** button. |
| Unreadable | **io.json is unreadable, or old io.csv files are present: nothing can be edited here. Fix the file, or migrate it with "pantin io migrate".** |
| Read failure | **The I/O list could not be read.** and the **Retry** button. |
| Editing | The full editor, described below. |

If a read fails while a mapping was already displayed, the view adds **The mapping shown may be out of date: the last refresh failed.** with **Retry**.

**Create the mapping** creates the I/O list by adding a first module, chosen by the core. On the command line, `pantin io init` creates the file and pre-fills it.

### The bar and the problem list

| Control | Effect | Greyed out when |
| --- | --- | --- |
| **Export GVL** | Downloads the CODESYS GVL of the mapping shown, unsaved changes included. | See below |

The button stays visible but inactive (explanatory tooltip) when:

- the mapping is not read yet (**The mapping is not read yet: the GVL is not available.**);
- there is no mapping (**No mapping: create it first to export the GVL.**);
- the mapping has problems (**The mapping has problems: fix them (list below) to export the GVL.**).

Under the button, **Problems (n)** lists everything the core finds to complain about. A problem attached to a cell is a button (tooltip **Go to the cell concerned**): it selects the module, scrolls to the cell and gives it the focus. A problem that concerns the whole file is plain text, prefixed **Whole file:**. The list disappears when there are no more.

### Modules

The left column, **Modules**, lists the modules. Each row is a toggle button (the chosen module is pressed) that shows:

- a connection dot (glyph) and its text, written on the module row: **bridge stopped**, **waiting for the PLC** or **PLC connected**;
- the module's key and its port (`m1`, `:1502`);
- the number of channels (**n channels**) and, if there are any, of problems (**n problems**).

| Control | Effect | Greyed out when |
| --- | --- | --- |
| Module row | Selects the module: its settings and its channels are displayed in the centre. | Never |
| **Add a module** | Adds a module to the list. The core chooses its key and port; you can change them afterwards. | A request is in progress |

With no module: **No module.**

### Module settings

In the centre, at the top, under **Module settings** for the selected module. Each field is sent as typed when you leave it; the core checks the ranges and the duplicates. A field in error is marked and its tooltip gives the reason.

| Field | Role |
| --- | --- |
| **Key** | Name of the module. Unique. |
| **Port** | Modbus TCP port of the module. |
| **Unit id** | Identifier of the Modbus unit. |
| **Word order** | **Low word first** or **High word first**, for 32-bit values. |
| **Watchdog (ms)** | Monitoring delay of the module (default 1000 ms, see [Connect a PLC](/en/guide/connect-a-plc)). |
| **Remove module key** | Removes the module and its channels. Greyed out during a request. |

The allowed ranges and their default values are in [Connect a PLC](/en/guide/connect-a-plc). Editing the I/O while the bridge is running stops it.

### The channel table

Under the settings, **Channels** lists the tags mapped to this module, one per row. With no channel: **No channel in this module.**

| Column | Content | Editable |
| --- | --- | --- |
| **Tag** | The viewer's tag (`assembly.element.member`). A click selects the element that owns it (tooltip **Select the element that owns name**). A tag the Pantin no longer knows stays as plain text. | No |
| **Variable** | Name of the CODESYS variable. | Yes |
| **Zone** | Modbus zone, shown as the core gives it: `coil`, `discrete_input`, `holding_register` or `input_register` (not translated). Computed by the core. | No |
| **Address** | Address in the zone. | Yes |
| **Type** | Type of the channel, computed by the core: `BOOL`, `REAL` or `DINT`. | No |
| **Comment** | Free text carried over into the GVL. | Yes |
| **Actions** | **Reassign** and **Remove** (see below). | Not applicable |

| Button | Effect |
| --- | --- |
| **Reassign** | Recomputes the tag's zone and type with the core (**Reassign name: the core derives zone and type again**). Greyed out during a request. |
| **Remove** | Removes the channel from the module; the tag becomes unmapped again (**Remove the channel name**). Greyed out during a request. |

A cell that has a problem is marked, and its tooltip gives the message.

### Unmapped tags

The right column, **Unmapped tags (n)**, lists the Pantin's tags that nobody has given to the PLC yet, grouped by assembly. With no tag to map: **Every tag is mapped.**

| Control | Effect | Greyed out when |
| --- | --- | --- |
| Tag name | Selects the owning element. | Never |
| **Map to module** | Adds this tag to the selected module (or, failing that, to the first module). | A request is in progress, or there is no module (**Add a module to map tags.**) |
| **Map all** | Adds all the unmapped tags to the selected module in a single request. | Same reasons |

The core chooses the zone, the type and the address: you do not type them when mapping. You can then change the address, the variable name and the comment in the table.

These buttons stay visible when inactive and keep their tooltip: clicking them does nothing, but the keyboard focus is not lost.

The table of zones and function codes is in [Connect a PLC](/en/guide/connect-a-plc).

::: warning Known limits
The wheel direction of the **Mouse: ZW3D** preset is the Babylon.js one (pushing the wheel forward zooms in); it has not been compared with the original software. The **Mouse: SolidWorks** preset zooms out when pushing forward.
:::
