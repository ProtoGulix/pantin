# Panels and buttons

This page lists every button, field and control of the viewer's panels, area by area. For each control: its **label** as the interface shows it, what it does, and when it is greyed out.

The menus (**File**, **Edit**, **View**) are described in [Menus](/en/reference/menus). Key and mouse combinations are in [Keyboard and mouse shortcuts](/en/reference/shortcuts). The general layout of the screen is in [The screen](/en/reference/interface). The three central views (3D, Diagram, I/O) are in [Central views](/en/reference/views).

::: tip Reading the tables
"Greyed out" means the button is visible but inactive. When a button is greyed out for a specific reason, the tooltip (on hover) often gives that reason. A field that is "validated on leaving" sends its value when you press **Enter** or click elsewhere.
:::

## The toolbar

It sits under the menu bar, above the tree. It exists only when a Pantin is open (without a Pantin, the [welcome window](#the-welcome-window) takes over).

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Close the Pantin (back to the welcome window)** (arrow) | Closes the Pantin and goes back to the welcome window. If the Pantin has unsaved changes, a [confirmation](#confirmations) asks what to do. | Never |
| **Save** | Writes the Pantin to disk. When there are unsaved changes, the tooltip becomes **Save (unsaved changes)** and a dot appears on the button. | No unsaved changes, or a request is in progress |
| **Import a 3D file (GLB, STL, STEP) into the open Pantin** | Opens the browser's file picker, then the [import form](#the-import-form). | A request or an import is in progress |
| **Frame all** | Places the 3D camera to see all the bodies. | No body, or the 3D view is not displayed (**Diagram** or I/O layout) |
| **Frame selection** | Places the 3D camera on the item selected in the tree. | No body, no tree node selected, or 3D view not displayed |
| **Central view**: **3D** / **Diagram** / **3D + Diagram** | Three toggle buttons, only one pressed: chooses what the central area displays. The tooltip gives the full name (**3D only**, **Chain diagram only**, **3D + Diagram**). | Never |
| Console counter (error and warning icons with two numbers) | Shows the number of errors and warnings of the [console](#the-console). A click opens or closes the console. The button is pressed when the console is open. | Never |
| Waiting wheel (**Working**) | Indicator, not a button: a request is in progress. | Not applicable |

::: info The I/O layout
The toolbar has only three view buttons. The **I/O alone** layout is chosen in the **View** menu, or with the **I/O config** button of the [PLC bridge card](#the-plc-bridge-card). The **F4** key cycles through **3D + Diagram**, **3D only** and **Chain diagram only**, and never goes through the I/O view.
:::

## The left panel

From top to bottom: the toolbar, the import form (only during an import), the tree, the **PLC bridge** card, the confirmation line, the message line. A handle between the panel and the central area lets you resize it (**Resize the panel**).

### The tree

The tree shows a single Pantin, with its whole structure. A click selects a row and shows its properties in the [inspector](#the-inspector). The navigation keys are in [Shortcuts](/en/reference/shortcuts).

The Pantin contains its assemblies, then a **Joints between assemblies** folder (with the number of joints in the detail). An assembly contains, in order: its sub-assemblies, its bodies, its internal joints, then folders of elements: **Action chain** (drives, actuators, sensors), **Conveying** (belts, guides, presence sensors), **Product flow** (emitters, absorbers). A body lists the joints that hold it (with "parent" or "child"), then its **Original nodes** (the nodes of the CAD file, greyed).

| Part of a row | What it does |
| --- | --- |
| Chevron | Folds or unfolds the branch. Absent when the row has no content. |
| Icon and name | A click selects. A double-click renames renamable rows (Pantin, assembly, body); on the others, it opens the inspector and folds or unfolds the row. |
| Greyed text on the right (detail) | Pantin: the number of bodies. Assembly: its key, that is the prefix of its tags. Joint: its type. Element: its type, and the body where it is placed when it has one. |
| Bolt | On a joint moved by an actuator. A click opens the form of that actuator (**Edit actuator**). |
| Sensor mark | On a watched joint. A click opens the form of its first sensor. |
| Eye | On an assembly. A click hides or shows it in the 3D view (**Hide in the 3D view** / **Show in the 3D view**). The state is never saved. |
| Round mark on the right | On a sensor: filled when its state tag is 1 (**On**), empty at 0 (**Off**). Read from the tags, never computed by the viewer. |
| Tinted "linked" row | When an element of the action chain is selected, the joints it moves or watches are tinted. |

Dragging a body onto an assembly (or onto a body of that assembly) moves it into that assembly. The same operation exists on the keyboard with the **Assembly** list of the inspector.

::: info Screen reader text
The icons carry no text: each row also has a hidden text that gives its type and state (for example "moved by Actuator 1", "watched by Upper limit switch", "hidden").
:::

### The context menu of a row

Right-click on a row (or the **Menu** key). An entry is offered only when it makes sense for the row.

| Entry | On | What it does |
| --- | --- | --- |
| **Rename** | Pantin, assembly, body | Puts the name in edit mode in the tree. |
| **Frame the view on this item** | Pantin, assembly, folder, body, joint... (not chain elements) | Frames the 3D camera on the row. |
| **Import into this Pantin** | Pantin | Opens the file picker. |
| **New assembly** | Pantin | Creates an empty assembly (default name **New assembly**). |
| **New joint…** | Assembly, **Joints between assemblies** folder | Opens the [joint form](#new-joint). |
| **Change type…** | Joint | Opens the joint form, pre-filled. |
| **Add an actuator…** / **Edit its actuator…** | Moving joint | Opens the actuator form for this joint. The entry says **Edit** if the joint already has an actuator. Absent on a fixed joint. |
| **Add a sensor…** | Moving joint | Opens the sensor form for this joint. |
| **Add end-of-stroke switches** | Joint with limited travel | Creates both end-of-stroke switches at the ends in one go. Absent on a fixed or continuous joint (without limits). |
| **Hide in the 3D view** / **Show in the 3D view** | Assembly | Hides or shows the assembly. |
| **Isolate in the 3D view** / **Show every assembly** | Assembly | Keeps only this assembly visible; the entry becomes **Show every assembly** to restore everything. |
| **Delete** | Body, joint, assembly | Asks for confirmation (see [the confirmations](#confirmations)). |
| **Edit** | Element (drive, actuator, sensor, conveying object) | Opens its form. |
| **Show in I/O** | Element that owns tags | Switches to the I/O view on its tags. |
| **Delete** | Element | Deletes the element without confirmation. |

Esc or a click elsewhere closes the menu.

### The import form

It opens under the toolbar after a file is chosen (**3D file to import**) through **Import a 3D file...**, **Import…** or **Import into this Pantin**. The accepted formats are `.glb`, `.stl`, `.stp` and `.step`; any other file produces an error message.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| Title **Import into "name"** | Reminds the target Pantin. | Not applicable |
| File name and format badge (**GLB**, **STL**, **STEP**) | Remind the chosen file. | Not applicable |
| **Unit** | Length unit of the file: **m (metres)**, **mm (millimetres)**, **cm (centimetres)**, **in (inches)**. Shown only for an STL: the other formats carry their own unit. | During the import |
| **Up axis** | **Y up (glTF standard)** or **Z up (CAD)**. | During the import |
| **Import** | Starts the import. | An import or a request is in progress |
| **Cancel** | Abandons the import. | Replaced by the waiting wheel during the import |

During the import, the form shows **Importing…**. For a STEP: **Converting STEP… Up to 2 minutes; keep this page open.**

### The PLC bridge card

The card is at the very bottom of the left panel. It is visible in all central layouts. It appears as soon as the core answers about the bridge state.

The status line shows a coloured dot and the state text, followed by a clickable pill that tells the network mode.

| State | Dot | Action button |
| --- | --- | --- |
| **Stopped** | neutral | **Start** |
| **Starting…** | busy | **Stop** |
| **Running** | green | **Stop** |
| **Stopping…** | busy | **Stop** (greyed out) |
| **Failed** | red | **Restart** |

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **I/O config** (tooltip **Configure I/O**) | Switches to the I/O view, where the modules are set. Stays marked "active" while the I/O view is displayed. | Never |
| **Start** / **Stop** / **Restart** | Starts, stops or restarts the bridge. The icon follows the action. A stop is never blocked, except during **Stopping…**. | A request to the bridge is in progress; for **Start** and **Restart** only, the bridge is unavailable (the core has no bridge configured) or a bridge started outside Pantin is already connected; **Stop** is blocked by neither of these two reasons |
| Pill **Network: local** / **Network: private network** | Unfolds or folds the network settings. It restates the mode even when folded. It stays open as long as a network error is displayed. | Never |
| **Local only (127.0.0.1)** | The bridge listens only on the local machine. | Bridge running, starting or stopping; bridge unavailable |
| **Private network** | The bridge listens on an address of the local network. Makes the next two fields appear. | Same |
| **Listen address** | List of the local addresses offered by the core. Present in **Private network** mode. | Same |
| **Allowed PLCs (IPs or CIDRs, comma separated)** | Whitelist of the PLC addresses that are admitted. Validated on leaving the field. Present in **Private network** mode. | Same |

Under the status line, depending on the context:

| Area | Content |
| --- | --- |
| Note | Reason why the button or the settings are inactive: "Start the core with `--bridge-python <path>` (`pnpm setup:python`)." when the bridge is unavailable, or **A bridge started outside Pantin is connected.** when another bridge already holds the place. |
| Network error | The core's refusal (non-private address, invalid list...) is shown in red and forces the network settings open. |
| Module lines | One line per I/O module: dot, module **key** (`m1`...), `address:port` that the PLC must target, and status as text: **bridge stopped**, **waiting for the PLC** or **PLC connected**. Bridge stopped: the lines come from the I/O list and the address is the one a start would use. Bridge running: they come from what the core reports. |
| **No module: configure the I/O** | Replaces the lines when the I/O list has no module. |
| **Any I/O edit stops the bridge.** | Reminder shown while the bridge is running. |
| **n forced tag(s): the PLC cannot write them** and button **Release all (n)** | Shown when the bridge is running and tags are forced from the viewer. The button gives them all back to the PLC. |
| Failure block (alert role) | When the state is **Failed**: a title (**The bridge refuses its configuration**, **The bridge cannot reach the core**, **The I/O list is not valid**, **The I/O changed: restart the bridge**, **The bridge lost its link to the core**, **Protocol error between the bridge and the core**, **Unexpected bridge error**, **The bridge could not be launched**, **The bridge did not start in time**, **The bridge stopped abruptly**), the bridge's message (in English) and a **Bridge log** pane. **The I/O changed** is shown as a warning, not an error: nothing is broken. |

Closing the Pantin while the bridge is running adds a question to the [confirmation](#confirmations): **The PLC bridge keeps running when the Pantin is closed.**

### Confirmations

A confirmation is shown inline, above the message line, in place of a dialog. It takes the keyboard: **Enter** validates the primary button, **Esc** chooses **Cancel**. The buttons are greyed out during a request, so that a choice never goes out twice. In every deletion question, **Delete** is the primary button.

| Question | Buttons |
| --- | --- |
| **Pantin "name" has unsaved changes.** | **Save** (primary), **Don't save**, **Cancel** |
| The same, with a bridge running | Adds the **Also stop the bridge** checkbox |
| **The PLC bridge keeps running when the Pantin is closed.** (no pending change) | **Stop the bridge and close** (primary), **Close without stopping the bridge**, **Cancel** |
| **Delete body "name"?** | **Delete**, **Cancel** |
| **Delete joint "name"?** | **Delete**, **Cancel** |
| **Delete assembly "name" and all its contents?** | **Delete**, **Cancel**. A list says what disappears: bodies, joints of the assembly, joints with other assemblies, drives, actuators, sensors, sub-assemblies, removed tags and added tags, and the assemblies that lose their attachment. |
| **Delete n orphan file(s) from the meshes folder?** (**File** menu, **Clean up orphan files…**) | **Delete**, **Cancel**. The list gives the files and their size. |
| **Replace the feed of ... by one from ...?** (new link in the diagram) | **Replace**, **Cancel** |

Deleting a drive, an actuator, a sensor or a conveying object asks for no confirmation.

### The message line

A line at the bottom of the panel shows the last message: an **Error** or **Information** icon, the text, possibly a detail (the core's text) and links to named elements. A click on a link selects the element. The **Dismiss the message** button clears it.

## The inspector

The right-hand panel. It opens and closes through the **View** menu, or with the panel's cross (tooltip **Cancel**). It shows what is selected in the tree, in the 3D view or in the diagram. It keeps the following shape, from top to bottom:

1. the **Inspector** title;
2. the inspector toolbar;
3. the current form (joint, drive, actuator, sensor or conveying object), if there is one;
4. the position slider, for a joint;
5. the subject (for example **Drive · Valve 1**);
6. the **Create a product** button, for an emitter;
7. the **Positioning** section, for an assembly or a body;
8. the **Property** / **Value** table, whose sections fold with their header, then the **I/O** section.

With no selection, the inspector says: **Nothing to show here: select an item in the tree, the 3D view or the diagram.**

### The inspector toolbar

Three groups of icons, separated by a line. A group that does not apply to the selection is omitted. The tooltip of each icon is its name.

| Group | Icon | What it does | Greyed out when |
| --- | --- | --- | --- |
| Create | **New drive** | Opens the drive form. | Never |
| Create | **New actuator** | Opens the actuator form. | No moving joint (slider or pivot) exists. The tooltip says: **Create a slider or a pivot first: an actuator moves joints.** |
| Create | **New sensor** | Opens the sensor form. | Same reason as the actuator |
| Create | **New belt**, **New guide**, **New emitter**, **New absorber**, **New presence sensor** | Open the form of the object. | No assembly (**An assembly is needed first.**); for the belt, no continuous pivot joint for the drum (**A continuous joint is needed first for the drum.**) |
| Position | **Move (G)**, **Rotate (R)** | Activates the placement gizmo in the 3D view (toggle button). With a body selected, the selection moves to its assembly. | No assembly selected, or 3D view not displayed |
| Position | **Assembly's own axes (L)** / **Anchor's axes (L)** | Chooses the gizmo's axes: those of the assembly or those of its support. | Same reasons |
| Position | **Align (A)** | Starts or stops an alignment by faces. | Same reasons, except to stop an alignment in progress |
| Position | Step field (**Move step, in mm** or **Rotation step, in degrees**) | Snapping step of the gizmo, validated on leaving. Holding **Ctrl** during a drag removes the snapping. Visible only when **Move** or **Rotate** is active. | Never |
| Position | **Restore the previous placement** | Gives back the placement kept before the last change. | Nothing to restore (the tooltip says **nothing to restore**), or the assembly's anchor has changed |
| Element | **Edit** | Opens the form of the selected element. | Never |
| Element | **Delete** | Deletes the selected element, without confirmation. | Never |

The cross in the title closes the inspector.

### Section headers

Each section of the table starts with a header row: a chevron and the name of the section (**General**, **Parameters**, **Commands**, **Feedback**, **Faults**...). Clicking the header folds or unfolds the section. The folded state is kept for the session, per section: it survives a change of selection.

### The table rows

| Row type | Appearance | Behaviour |
| --- | --- | --- |
| Read-only text | Plain value | Nothing to do. Greyed rows (original nodes, **Tags** of a joint) are informative. |
| Text field | Editable field | Validated on leaving or with **Enter**. **Esc** cancels. A refused value stays in the field, marked, with the reason under the section (alert role). |
| List | Drop-down list | Applies the choice immediately. |
| Link | Value as a button | A click on the row selects what it names (a body, a joint, an element). |
| Live value | Text updated four times a second | Position, states, feedback tags. A bit is shown as **On** or **Off**. The full tag name is the row's tooltip. |
| Toggle button (**On** / **Off**) | Pressed or not pressed button | See below. |
| Number field and **Send** | Field, button, current value | See below. |

#### Forcing a tag: toggle, Send, Release

The commands of a drive and the setpoint of a joint without an actuator are tags that the viewer can write, as the PLC would.

| Control | What it does |
| --- | --- |
| **On** / **Off** button (boolean command) | Writes the inverse of the value read. The button keeps a fixed name for screen readers; the state is in "pressed". |
| Number field | Type a value in mm, degrees, mm/s... according to the row's label. |
| **Send** (or **Enter** in the field) | Writes the typed value. Text that is not a number sends nothing. |
| **forced** mark (padlock) | Appears on the row as soon as the tag is forced. It says in text, not only in colour, that the write comes from the viewer. The tooltip explains: **Forced from the viewer: the PLC cannot write this tag until it is released**. |
| **Release** (open padlock, tooltip **Release tag name**) | Gives the tag back to the PLC. The mark disappears. Keyboard focus stays on the row. |

While a tag is forced, the PLC's writes to that tag are ignored (and noted in the console). **Release all** is in the [transport bar](#the-transport-bar) and in the bridge card.

### What the inspector shows depending on the selection

#### A Pantin

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Identifier**, **Body count**, **Unsaved changes** (**Yes** / **No**) |
| Element index | See "Index" below |

#### An assembly

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Key (tag prefix)** (editable; renaming it renames the tags), **Contained in** (if a sub-assembly, read-only), **Body count** |
| **Positioning** (title: **Position in "anchor"** or **Position in the world**) | **Frame** (the reference assembly, or **world**), then six editable fields: **X**, **Y**, **Z** in mm, **RX**, **RY**, **RZ** in degrees |
| Element index | See "Index" below |

Typing an invalid value keeps the text in the field, marked, with **Value refused: type a number.** During a gizmo drag, the fields show the current value (marked "dragged"). **Enter** moves to the next field.

#### A body

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Identifier**, **Assembly** (list: moves the body into another assembly, which moves its parent joint and makes its tags follow) |
| **Placement** | Only if the body has a placement: **Frame**, X, Y, Z, RX, RY, RZ, read-only |
| **Joints** | One row per joint that holds the body (role: "child of ..." or "parent of ..."), clickable; or **No joint** |
| **Source** | **File**, **Format**, **Unit**, **Up axis** |
| **Mesh** | **Mesh file** |
| **Original nodes** | Path and name of each node of the CAD file (or **(no node in file)**) |
| **Positioning** | A row says **Placed with the assembly "name"**, with the placement tools of the toolbar |

#### A folder or an original node

A folder (for example **Joints between assemblies**) shows **Name** and **Item count**. An original node shows **Original name** and **Path**, greyed.

#### A joint

Under the subject **Joint · name** appears the slider **Position of "name"**: it moves the joint by hand, in mm or degrees, between its limits. It sends at most 30 positions per second and follows the core's stream when you do not hold it.

| Section | Rows |
| --- | --- |
| **General** | **Name**, **Identifier**, **Tag key** (editable), **Tags** (greyed: the setpoint and the position, or **None while the joint is fixed**), **Type** (list: opens the joint form to enter the parameters of the new type), **Parent body**, **Child body** (lists) |
| **Joint frame** | **Axis** (**X**, **Y**, **Z** or **Other**), **Direction** (**Positive (+)** / **Reversed (−)**), the three axis components if **Other**, then **Origin X / Y / Z (mm)** |
| **Parameters** | Depending on the type: **Limits** (lower and upper), **Pitch (travel per turn)** for the helical joint |
| **Position** | Absent on a fixed joint. **Position** (live value), **Jammed** (toggle: injectable fault), and **Setpoint** (number field with **Send**, only when no actuator moves the joint) |
| **Links** | **Actuator** (clickable, or **None: right-click the joint to add one**) and one **Sensor** link per sensor that watches it |
| **I/O** | See [the I/O section](#the-i-o-section-of-the-inspector) |

The joint types are: **Fixed**, **Prismatic (slider)**, **Revolute (limited pivot)**, **Continuous (unlimited pivot)**, **Helical (screw and nut)**.

#### A drive

Subject **Drive · name**.

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Type**, **Tag prefix** (`assembly.key`) |
| **Parameters** | The parameters of the type (speeds, ramps...), editable, with their unit |
| **Commands** | The tags the PLC writes: **On** / **Off** toggle for a bit, field and **Send** for a value. **forced** mark and **Release** per row. |
| **Feedback** | The tags the PLC reads (live values) |
| **Faults** | **Not responding** (toggle: the drive ignores its commands), and **Diagnostics** |
| **I/O** | See [the I/O section](#the-i-o-section-of-the-inspector) |

The **Diagnostics** row says **None** when all is well. Otherwise it shows a warning, for example for a valve: **Conflicting commands: both coils are on; the spool stays where it is.** The same warning appears under the node in the [diagram](/en/reference/views#the-chain-diagram) and in the console.

Drive types: **Valve 3/2, single solenoid**, **Double valve 3/2**, **Valve 5/2, single solenoid**, **Valve 5/2, double solenoid**, **Valve 5/3, closed centre**, **Valve 5/3, exhaust centre**, **Valve 5/3, pressure centre**, **Contactor**, **Reversing contactor**, **Variable speed drive, on/off**, **Variable speed drive, analog**, **Servo drive**.

#### An actuator

Subject **Actuator · name**. Sections: **General** (**Name**, **Type**) and **Parameters** (editable, with their unit). The feed and the moved joints are not repeated there: the [diagram](/en/reference/views#the-chain-diagram) draws them, and the **Edit** form lets you change them. No **I/O** section: an actuator has no tag.

Actuator types: **Double-acting cylinder**, **Single-acting cylinder**, **AC motor**, **Servo motor**.

#### A sensor

Subject **Sensor · name**. Sections: **General** (**Name**, **Type**, **Tag prefix**), **Parameters** (range, resolution, hysteresis, **Normally closed**..., depending on the type; the choices and checkboxes are **Yes** / **No** lists), **State** (the sensor's tags, as live values) and **I/O**.

Joint sensor types: **Ideal switch**, **Mechanical limit switch**, **Cylinder sensor (magnetic)**, **Inductive sensor (axial)**, **Encoder**.

#### A belt, a guide, an emitter, an absorber, a presence sensor

Subject **Belt · name**, **Guide · name**, **Emitter · name**, **Absorber · name** or **Presence sensor · name**.

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Type**, **Tag prefix** (emitter and presence sensor only) |
| **Frame** | **Assembly**, **Followed body** (or **none (the assembly's frame)**), read-only |
| **Placement** | **X**, **Y**, **Z** (mm), **RX**, **RY**, **RZ** (degrees), editable |
| **Parameters** | Depending on the object (see the form below) |
| **State** | Emitter: **Product creation (spawn)** (bit). Presence sensor: its tags (for example the detected state). |
| **I/O** | See [the I/O section](#the-i-o-section-of-the-inspector) |

For a selected emitter, the **Create a product** button appears above the table. It writes 1 then 0 on the emitter's creation tag: a product appears at the next step. The tooltip reminds this.

#### Index: what you see on a Pantin or an assembly

Under the properties, sections list the elements, one row each, with name and type. A click on the row selects the element.

| Section | Content |
| --- | --- |
| **Drives** | One row per drive. Its live value shows the active commands. |
| **Actuators** | One row per actuator |
| **Sensors** | One row per sensor, with its state |
| **Conveying** | Belts, guides, emitters, absorbers, presence sensors (the sensor's state as a live value) |

A family with no element is explained in one sentence under the table (for example **No drive yet: it is what the PLC commands (valve, contactor, variable speed drive), through its tags.**).

### The I/O section of the inspector

It appears for an element that owns tags (moving joint, drive, sensor, emitter, presence sensor), at the end of the table. One row per tag:

| Control | What it does | Greyed out when |
| --- | --- | --- |
| Tag name and state | Connection dot of the module (if the tag is mapped) and text: `module · zone address` (for example `m1 · coil 0`) or **not mapped**. | Not applicable |
| **Map** (unmapped tag) | Maps the tag to the module selected in the I/O view, or to the first module of the list. | No module (**Add a module in the I/O view to map tags.**), unreadable `io.json` file (**io.json cannot be edited: see the I/O view.**), or request in progress |
| **Open in I/O** (mapped tag, icon) | Switches to the I/O view and shows the tag in its module. | Never |
| **Retry** (when the list is unreadable) | Reads the I/O list again; the section says **I/O unavailable**. | Request in progress |

## The forms

The forms open at the top of the inspector (except the import, which is in the left panel). In each one, **Cancel** closes without sending anything and the primary button (**Create** on creation, **Apply** on modification) sends. This button is greyed out during a request. A form refused by the core keeps its content in place and shows a message.

### New joint

Title **New joint in "Pantin name"**, or **Change joint "name"**. **Enter** validates, **Esc** cancels.

| Field | Role |
| --- | --- |
| **Type** | **Fixed**, **Prismatic (slider)**, **Revolute (limited pivot)**, **Continuous (unlimited pivot)**, **Helical (screw and nut)**. The parameter rows below change with the type. |
| **Name** | Name of the joint. |
| **Parent body**, **Child body** | Lists of the bodies. A colour dot reminds the body's tint in the 3D view. |
| **Axis (frame of "assembly")** | Radio buttons **X**, **Y**, **Z**, **Other**. With **Other**, three component fields appear; otherwise the **Reversed** checkbox appears. |
| **Take the axis from a face** | Waits for a click on a face of the 3D view, which fills the origin and the axis (text **Click a face in the 3D view (Esc: cancel)**). Present only when the form edits an existing moving joint. |
| **Reverse the axis** | Reverses the direction of the axis without sending anything. |
| **Origin (frame of "assembly")** | Three fields in mm. |
| Type parameters | **Limits** (**lower** and **upper**, in mm or degrees depending on the type), **Pitch (travel per turn)** for the helical joint. |

A sentence reminds that the axis is taken in the parent body's frame, Z up, and that the arrow in the 3D view shows the positive direction of travel.

### New drive

Title **New drive** or **Edit drive**.

| Field | Role |
| --- | --- |
| **Name** | Name of the drive. |
| **Type** | See the list of types above. Changing the type replaces the parameters. |
| **Tags in assembly** | Assembly whose key prefixes the tags. |
| Parameters | One field per parameter of the type, with its unit. |

As long as no actuator moves a joint, a note specifies that the speeds are in mm (**Speeds are in the unit of the joints it will move: mm until it feeds a rotary actuator.**).

### New actuator

Title **New actuator** or **Edit actuator**.

| Field | Role |
| --- | --- |
| **Name**, **Type**, **Tags in assembly** | Like the drive. |
| **Drive that feeds it** | List of compatible drives, or **None**. If none fits: **No drive fits this type: create one whose outputs match.** |
| One list per input of the type | Chooses the drive output linked to each input of the actuator. Appears only with a drive. |
| **Joints it moves** | One checkbox per free moving joint. |
| Parameters | One field per parameter of the type, with its unit. |

If you replace the feed of an actuator that is already fed, a confirmation asks **Replace** or **Cancel**.

### New sensor

Title **New sensor** or **Edit sensor**.

| Field | Role |
| --- | --- |
| **Name**, **Type**, **Tags in assembly** | As above. |
| **Watched joint** | List of the moving joints. |
| Switch diagram | For position sensors: dimensioned drawing of the range, updated while typing. Absent as long as a field is not a number. |
| Parameters | Range (lower and upper), position, hysteresis, resolution, **Normally closed**... depending on the type, with their unit. |

### Creating a conveying object

Title **Create: Belt** (or **Guide**, **Emitter**, **Absorber**, **Presence sensor**), then **Edit: ...** on modification.

| Field | Role |
| --- | --- |
| **Name**, **Assembly** | Name and carrying assembly. |
| **Type** | Presence sensor only (**Photoelectric cell**). |
| **Followed body** | Body that the object follows, or **None: the assembly's frame**. |
| **Placement (mm, degrees)** | **X**, **Y**, **Z**, **RX**, **RY**, **RZ**. |
| Belt | **Length**, **Width**, **Drum radius** (mm), **Drum (continuous joint)**. Initial values: 1000, 300, 50. |
| Guide | **Size X**, **Y**, **Z** (mm). Initial values: 1000, 20, 60. |
| Emitter | **Size X**, **Y**, **Z** (mm), **Mass** (kg), **Material** (**Cardboard**, **Plastic**, **Wood**, **Steel**, **Stainless steel**, **Aluminium**, **Brass**, **Copper**). Initial values: 200, 150, 100, 0.5 kg, cardboard. |
| Absorber | **Size X**, **Y**, **Z** (mm). Initial values: 200, 300, 100. |
| Presence sensor | The parameters of its type (range, delay, inversion...). |

## The Positioning section and alignment

The **Positioning** section appears for an assembly or a body. The tools are in the inspector's toolbar (see above); the gizmo's movement in the 3D view is described in [Central views](/en/reference/views#the-placement-gizmo).

When an alignment is in progress (**Align (A)** button pressed), an **Align "name"** block is displayed under the tools.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Alignment** (list) | **Plane on plane**, **Axis on axis**, **Axis on axis about a pivot**. Changes the number of picks asked. | Never |
| List of picks | One row per face to pick (for example **Plane face of the moving part**), with the state **to pick**, **click in the 3D view** or the chosen face. A pick already made is a button: clicking it replaces it with the next click in the 3D view. | Not applicable |
| **Flip** | Reverses the direction of the alignment (plane on plane). | Absent for the types without this parameter |
| **Offset (mm)** | Distance between the two faces. Validated on leaving; **Enter** validates then applies if everything is picked. | Absent depending on the type |
| **Rotation (°)** | Rotation around the axis. Same behaviour. | Absent depending on the type |
| **Then create a fixed joint** | Creates a fixed joint between the two assemblies after the alignment. | If the assembly is already linked (the note gives the joint: **Already linked by "name"**) |
| Clock note | **With the simulation running, the target may move while you align. Pause it first.** | Not applicable |
| **Start over** | Clears the picks. | Never |
| **Align** | Applies the alignment. | A pick is missing, or a request is in progress |

A refused pick shows the reason in the message line (for example **This face is not plane.**).

## The transport bar

It is at the top of the central area and exists only while a Pantin is open. Simulated time advances in fixed steps of 1/120 s.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Pause** / **Resume** | A single toggle button. During the simulation, **Pause** freezes the simulated time; when paused, **Resume** restarts it. The label and the icon say the action the button will do. | The clock state is not yet known |
| **1 step** | Advances one simulation step. | The simulation is running (available when paused only) |
| **10 steps** | Advances ten steps. | The simulation is running |
| **Reset** | Clears the products, the commands and the faults. Unsaved changes and the clock stay. | The clock state is not yet known |
| **Release all (n)** | Gives back to the PLC the `n` tags forced from the viewer. The button is hidden as long as no tag is forced. | Hidden with no forced tag |
| Time (`12.345 s`) | Simulated time since the reset. Tooltip **Simulated time**. | Not applicable |
| Counter (`n steps`) | Number of simulated steps. Tooltip **Simulated steps**. | Not applicable |
| Warning (icon and text) | **The simulation is falling behind real time (n%)**: the core cannot run all the steps due. The tooltip specifies that, once a PLC is connected, its timers follow the real clock and might expire wrongly. | Not applicable |

::: info Same as the menu
**Reset** also exists in **Edit**, but the menu entry waits for the end of a request in progress; the bar's button does not wait. **Release all forced tags** is also in **Edit**.
:::

The console also warns when the simulation is paused while a PLC bridge is connected: the PLC sees a frozen machine.

## The console

The console is a panel under the central area. The toolbar counter opens and closes it, like **F8**. A handle above it lets you change its height (**Resize the console**); a double-click on the handle restores the original height. The height is kept in the browser.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| Title **Pantin console** | Name of the panel. | Not applicable |
| **Error** / **Warning** / **Info** (filters) | Three toggle buttons: show or hide the lines of this level. Pressed = shown. | Never |
| **Clear** | Hides the lines read so far, in this viewer only; the core keeps its history. | No line read (filters that hide every line do not grey it out) |
| **Close the console** (cross) | Closes the panel. | Never |
| List of lines | One line per event: simulation time, level, source, text, detail and repeat counter. | Not applicable |

A line whose source still exists is clickable: a click (or **Enter**) selects the source (a drive, a joint...). A deleted source is shown as **(deleted)**. When nothing is displayed, the list says **Nothing to report for this Pantin.** or **No line for the levels shown.**

The console reports in particular: a PLC write ignored on a forced tag, an error in a simulation step, a diagnostic that appeared or cleared, a fault injected or removed, a document migrated on opening, a pause or a resume, a blocked emitter, the product limit reached, the connections and disconnections of the PLC and of the bridge.

## The welcome window

It is displayed when no Pantin is open. It is a modal window above the empty 3D view. **Esc** or the **Close the welcome window** cross hides it; **File**, **Welcome** brings it back. Two tabs, with the left and right arrows to switch between them.

### Home tab

| Control | What it does |
| --- | --- |
| **Empty Pantin** | Opens a **Name of the new Pantin** field. **Enter** or the **Create** button (tick) creates and opens the Pantin; **Cancel** (cross) or **Esc** closes the field. |
| **From a 3D file** | Opens the file picker, creates a Pantin bearing the file's name, then opens the [import form](#the-import-form). |
| **Recent** | Up to six cards (name, body count, modification date), most recent first. A click opens the Pantin. With no Pantin: **No Pantin yet. Create one above.** |
| **Resources** | Links that open in a new tab: **Project repository**, **Guides**, **Design decisions**. |
| **Keyboard shortcuts** | Reminder of the main shortcuts. |

### All Pantins tab

| Control | What it does |
| --- | --- |
| **Filter by name or id** | Search field, case-insensitive. Empty: everything is kept. |
| **Pantin list** | One row per Pantin: name, identifier, body count and date. A click selects; a double-click, **Enter** or the **Open** button opens. The arrows, **Home** and **End** move the selection. |
| Empty texts | **No Pantin yet. Create one from the Home tab.**; **No Pantin matches the filter.** |

The window's errors (unsupported file, unreachable core...) are shown in the window's message line.

::: warning Not verified
The exact style of the coloured dots (bridge, modules) is defined by the stylesheet; this page describes what the text and the structure say, not the tints.
:::
