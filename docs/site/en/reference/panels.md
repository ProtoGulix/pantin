# Panels and buttons

Every button, field and control of the panels, area by area: its **label**, what it does, and when it is greyed out.

The menus (**File**, **Edit**, **View**) are described in [Menus](/en/reference/menus). Key and mouse combinations are in [Keyboard and mouse shortcuts](/en/reference/shortcuts). The general layout of the screen is in [The screen](/en/reference/interface). The four central views (3D, Diagram, Joints, I/O) are in [Central views](/en/reference/views).

::: tip Reading the tables
"Greyed out": the button is visible but inactive, and its tooltip often gives the reason. A field "validated on leaving" sends its value with **Enter** or a click elsewhere.
:::

## The toolbar

It sits under the menu bar, above the tree. It exists only when a Pantin is open (without a Pantin, the [welcome window](#the-welcome-window) takes over).

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Close the Pantin (back to the welcome window)** (arrow) | Closes the Pantin and goes back to the welcome window. If the Pantin has unsaved changes, a [confirmation](#confirmations) asks what to do. | Never |
| **Save** | Writes the Pantin to disk. When there are unsaved changes, the tooltip becomes **Save (unsaved changes)** and a dot appears on the button. | No unsaved changes, or a request is in progress |
| **Import a 3D file (GLB, STL, STEP) into the open Pantin** | Opens the browser's file picker, then the [import form](#the-import-form). | A request or an import is in progress |
| **Frame all** | Places the 3D camera to see all the bodies. | No body, or the 3D view is shown in no zone |
| **Frame selection** | Places the 3D camera on the item selected in the tree. | No body, no tree node selected, or 3D view not displayed |
| Waiting wheel (**Working**) | Indicator, not a button: a request is in progress. | Not applicable |

::: info Choosing the views
The toolbar has no view button: each zone of the central area has its own selector, at the top left (see [Central views](/en/reference/views#the-zones-and-their-selectors)). The I/O view is chosen in one of these selectors, in the **View** menu, or with the **I/O config** button of the [PLC bridge card](#the-plc-bridge-card): if it is shown in no zone, that button puts it in the top zone. The <kbd>F4</kbd> key moves the top zone to the next view.
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

Dragging a body onto an assembly (or onto a body of that assembly) moves it into that assembly. The same operation exists on the keyboard with the **Assembly** list of the inspector. Its fixed joints to the old assembly are deleted and listed in the message. The core refuses the move when the body, its old group and its new group are not moved by the same joint (or by none); its message is shown word for word.

**Multi-selection.** <kbd>Ctrl</kbd>+click adds or removes a row, <kbd>Shift</kbd>+click takes a range, <kbd>Shift</kbd>+arrows extends it. Only body and group rows (an assembly filed inside another) of one assembly can be selected together. Other commands act on the first selected row. The 3D view stays single-selection.

**Group rows.** A group is an assembly row. Like a body, it first lists the joints it is an end of, with "parent" or "child". See [Concepts](/en/guide/model#concepts-body-assembly-group).

::: info Screen reader text
The icons carry no text: each row also has a hidden text that gives its type and state (for example "moved by Actuator 1", "watched by Upper limit switch", "hidden").
:::

### The context menu of a row

![The context menu of an assembly in the tree](/screenshots/en/tree-context-menu.webp)

Right-click on a row (or the **Menu** key). An entry is offered only when it makes sense for the row.

| Entry | On | What it does |
| --- | --- | --- |
| **Rename** | Pantin, assembly, body | Puts the name in edit mode in the tree. |
| **Frame the view on this item** | Pantin, assembly, folder, body, joint... (not chain elements) | Frames the 3D camera on the row. |
| **Import into this Pantin** | Pantin | Opens the file picker. |
| **New assembly** | Pantin | Creates an empty assembly (default name **New assembly**). |
| **New joint…** | Assembly, **Joints between assemblies** folder | Opens the [joint form](#new-joint). |
| **Group…** | Body, assembly | Opens the [group name line](#group) for the selected rows. Offered only if the selection is made of bodies and sub-groups of one assembly. |
| **Ungroup** | Assembly filed inside another | Dissolves the group into its assembly. See [Ungroup a group](/en/guide/groups#ungroup-a-group). |
| **Change type…** | Joint | Opens the joint form, pre-filled. |
| **Add an actuator…** / **Edit its actuator…** | Moving joint | Opens the actuator form for this joint. The entry says **Edit** if the joint already has an actuator. Absent on a fixed joint. |
| **Add a sensor…** | Moving joint | Opens the sensor form for this joint. |
| **Add end-of-stroke switches** | Joint with limited travel | Creates both end-of-stroke switches at the ends in one go. Absent on a fixed or continuous joint (without limits). |
| **Hide in the 3D view** / **Show in the 3D view** | Assembly | Hides or shows the assembly. |
| **Isolate in the 3D view** / **Show every assembly** | Assembly | Keeps only this assembly visible; the entry becomes **Show every assembly** to restore everything. |
| **Delete** | Body, joint, assembly | Asks for confirmation (see [the confirmations](#confirmations)). |
| **Edit** | Element (drive, actuator, sensor, conveying object) | Opens its form. |
| **Show in I/O** | Element that owns tags | Switches to the I/O view on its tags. |
| **Delete** | Element | Asks for confirmation for a drive, an actuator or a sensor (see [the confirmations](#confirmations)). A conveying object is deleted without confirmation. |

Esc or a click elsewhere closes the menu.

### The import form

![The import form under the toolbar, with the Up axis list](/screenshots/en/import-form.webp)

It opens under the toolbar after a file is chosen (**3D file to import**) through **Import a 3D file...**, **Import…** or **Import into this Pantin**. The accepted formats are `.glb`, `.stl`, `.stp` and `.step`; any other file produces an error message.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| Title **Import into "name"** | Reminds the target Pantin. | Not applicable |
| File name and format badge (**GLB**, **STL**, **STEP**) | Remind the chosen file. | Not applicable |
| **Unit** | Length unit of the file: **m (metres)**, **mm (millimetres)**, **cm (centimetres)**, **in (inches)**. Shown only for an STL: the other formats carry their own unit. | During the import |
| **Up axis** | **Y up (glTF standard)** or **Z up (CAD)**. Shown only for a GLB and an STL: a converted STEP is always Z up. | During the import |
| **Import** | Starts the import. | An import or a request is in progress |
| **Cancel** | Abandons the import. | Replaced by the waiting wheel during the import |

During the import, the form shows **Importing…**. For a STEP: **Converting STEP… Up to 2 minutes; keep this page open.**

### The PLC bridge card

![The PLC bridge card, bridge stopped](/screenshots/en/bridge-stopped.webp)

![The PLC bridge card, bridge running](/screenshots/en/bridge-running.webp)

The card is at the bottom of the left panel, visible whichever views are displayed.

The status line shows a dot (check, ring, half-filled ring or cross in an octagon, besides the colour) and the state text, followed by a clickable pill that tells the network mode.

| State | Dot | Action button |
| --- | --- | --- |
| **Stopped** | neutral | **Start** |
| **Starting…** | busy | **Stop** |
| **Running** | green | **Stop** |
| **Stopping…** | busy | **Stop** (greyed out) |
| **Failed** | red | **Restart** |

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Log** (tooltip **Open the PLC bridge log**) | Opens the [**PLC bridge log**](#the-plc-bridge-log) window. Always shown, to the left of **I/O config**. | Never |
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
| Network error | The core's refusal (non-private address, invalid list...) is shown in red, led by a cross in an octagon, and forces the network settings open. |
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
| **Delete drive "name"?** | **Delete**, **Cancel**. If the drive still feeds actuators, an extra line says: **It still feeds: c1, c2. The core refuses the deletion while these actuators depend on it: change their feed first.** |
| **Delete actuator "name"?** | **Delete**, **Cancel** |
| **Delete sensor "name"?** | **Delete**, **Cancel** |
| **Delete assembly "name" and all its contents?** | **Delete**, **Cancel**. A list says what disappears: bodies, joints of the assembly, joints with other assemblies, drives, actuators, sensors, sub-assemblies, removed tags and added tags, and the assemblies that lose their attachment. |
| **Delete n orphan file(s) from the meshes folder?** (**File** menu, **Clean up orphan files…**) | **Delete**, **Cancel**. The list gives the files and their size. |
| **Replace the feed of ... by one from ...?** (link drawn in the diagram) | **Replace**, **Cancel** |
| **Reloading pantin.json will discard the unsaved changes of Pantin "name".** (or **io.json**, or **Reloading the files will discard…**) (**Reload the file** button of the [banner](#the-external-edit-banner)) | **Reload and discard my changes**, **Cancel** |

Deleting a conveying object (emitter, belt...) asks for no confirmation.

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
| Element | **Delete** | Deletes the selected element, after confirmation for a drive, an actuator or a sensor. | Never |

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

![The inspector of a slider joint, with its position slider](/screenshots/en/inspector-joint.webp)

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
| **General** | **Name** (editable), **Type**, **Tag key** (editable: renaming it renames the tags, as for a joint), **Tag prefix** (`assembly.key`, read-only) |
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

Subject **Sensor · name**. Sections: **General** (**Name**, **Type**, **Tag key** (editable), **Tag prefix**), **Parameters** (range, resolution, hysteresis, **Normally closed**..., depending on the type; the choices and checkboxes are **Yes** / **No** lists), **State** (the sensor's tags, as live values) and **I/O**.

Joint sensor types: **Ideal switch**, **Mechanical limit switch**, **Cylinder sensor (magnetic)**, **Inductive sensor (axial)**, **Encoder**.

#### A belt, a guide, an emitter, an absorber, a presence sensor

Subject **Belt · name**, **Guide · name**, **Emitter · name**, **Absorber · name** or **Presence sensor · name**.

| Section | Rows |
| --- | --- |
| **General** | **Name** (editable), **Type**, **Tag key** (editable, emitter and presence sensor only: renaming it renames the tags, as for a joint), **Tag prefix** (`assembly.key`, read-only) |
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
| **Parent body**, **Child body** | Lists of the bodies, and of the groups (**Group: name** entries). Between two assemblies the child must be a group; the core decides and refuses with its sentence. A colour dot reminds the body's tint in the 3D view. |
| **Axis (frame of "assembly")** | Radio buttons **X**, **Y**, **Z**, **Other**. With **Other**, three component fields appear; otherwise the **Reversed** checkbox appears. |
| **Take the axis from a face** | Waits for a click on a face of the 3D view, which fills the origin and the axis (text **Click a face in the 3D view (Esc: cancel)**). Present only when the form edits an existing moving joint. |
| **Align the frame on this axis** | Turns the frame of the parent's assembly (and of the group the joint moves) so that this axis reads [0, 0, 1]; nothing moves. Present only for a joint already created whose type moves, absent for a fixed joint; disabled while the form has changes not applied and during a request (**Apply the joint's changes first: the alignment uses the stored axis.**). The message names the turned assemblies and the rewritten joints (**Frame aligned on the axis: …** or **Frames aligned on the axis: …**, then **Joints rewritten: …**), or **The frames are already aligned on this axis, nothing changed.** |
| **Reverse the axis** | Reverses the direction of the axis without sending anything. |
| **Origin (frame of "assembly")** | Three fields in mm. |
| Type parameters | **Limits** (**lower** and **upper**, in mm or degrees depending on the type), **Pitch (travel per turn)** for the helical joint. |

A sentence reminds that the axis is taken in the frame of the parent's assembly (the group itself when the parent is a group), Z up, and that the arrow in the 3D view shows the positive direction of travel.

### Group

After **Group…**, a line opens under the tree: `Group N items of assembly "X": what should the group be called?` (`Group 1 item…` for a single one).

| Control | What it does |
| --- | --- |
| **Group name** | Name of the future group (an assembly and a fixed joint of the same name). **Enter** validates. |
| **Group** | Creates the group. Message: `Group "name" created.`, followed by **Joints deleted: …** and **Tags were renamed: regenerate the PLC's GVL.** when they apply. |
| **Cancel** | Closes the line without sending anything. |

If the core refuses, its sentence is shown word for word and nothing changed. See [Make a group](/en/guide/groups#make-a-group).

### New drive

![The New drive form in the inspector](/screenshots/en/form-new-drive.webp)

Title **New drive** or **Edit drive**.

| Field | Role |
| --- | --- |
| **Name** | Name of the drive. |
| **Type** | See the list of types above. Changing the type replaces the parameters. |
| **Tags in assembly** | Assembly whose key prefixes the tags. |
| Parameters | One field per parameter of the type, with its unit. |

As long as no actuator moves a joint, a note specifies that the speeds are in mm (**Speeds are in the unit of the joints it will move: mm until it feeds a rotary actuator.**).

### New actuator

![The New actuator form in the inspector](/screenshots/en/form-new-actuator.webp)

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

## The external-edit banner

![The warning banner](/screenshots/en/external-edit-banner.webp)

It appears at the top of the central area, above the transport bar, while `pantin.json` or `io.json` changed on disk outside Pantin. It has a **Warning** glyph, a text and a bottom border: colour is never the only cue. Pantin reads the disk again when the window gets the focus back and at save; the principle is in [A Pantin is a folder](/en/guide/fundamentals#editing-a-file-outside-pantin).

| Control | What it does | Absent when |
| --- | --- | --- |
| Text **pantin.json modified outside Pantin. Saving will overwrite it.** (or with `io.json`) | Says which file changed. For both: **pantin.json and io.json modified outside Pantin. Saving will overwrite them.** | No file changed |
| **Reload the file** (**Reload the files** for both) | Discards the state in memory and reads the disk again. With unsaved changes, first asks the [question](#confirmations) **Reload and discard my changes** / **Cancel**. | No file changed |

A first **Save** that is itself the one to find the change is refused: the message line shows the core's text, `pantin.json was modified outside Pantin since it was opened. Save again to overwrite it, or reload it.` The banner then appears, and a second **Save** overwrites the disk. Saving or reloading clears the banner.

## The transport bar

![The transport bar: Pause, 1 step, 10 steps, Reset, simulated time and step count](/screenshots/en/transport-bar.webp)

![The transport bar with the Release all button while a tag is forced](/screenshots/en/release-all.webp)

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

### The PLC bridge log

![The PLC bridge log window: time, source and level columns, with a tinted warning line](/screenshots/en/bridge-journal.webp)

The card's **Log** button opens a **PLC bridge log** window. It shows the end of the bridge log file (see [The log file](#the-log-file)) as columns (**Log lines**), scrolled to the bottom. While it is open, it refreshes on every new bridge state.

Each entry shows: the local time `HH:MM:SS.mmm` (the full date is in the tooltip); a source badge, **Core** or **Bridge**; a level badge with its glyph, **Info**, **Warn.** (triangle, amber fill) or **Error** (cross in an octagon, red fill); the message (the Python logger name is only in the tooltip, the bridge's own timestamp is hidden). Continuation lines of an entry (a traceback, for instance) are indented under it. Warning and error rows are tinted, with a bar on the left.

Three toggles, in the **Levels shown** group, filter by level: **Error**, **Warning**, **Info**, each with its entry count. As in the console, the choice is kept while the page stays open. When no entry matches: **No entry for the levels shown.**

| Control | What it does | Greyed out when |
| --- | --- | --- |
| **Copy** | Copies the whole raw file to the clipboard, older lines not displayed included; the button says **Copied**, or **Cannot copy** if the browser refuses. | Never |
| **Download** | Downloads the whole raw file, named `<pantinId>-bridge.log`. | Never |
| **Close** | Closes the window. <kbd>Escape</kbd> does the same. | Never |

Window messages: **Reading the log…** while reading; **No log yet: it fills as soon as the bridge starts.** when the file does not exist; **Cannot read the log: …** on error; **n older entries are not shown: download the log to get them.** when the file is longer than the window.

Not to be confused with the **Bridge log** pane of the failure block, which only shows the last 20 lines of the bridge's output, and only after a failure.

#### The log file

The core writes one file per Pantin: `<Pantins folder>/.logs/<pantinId>/bridge.log` (the core's `--logs-dir` option changes the `.logs` folder). Past 1 MB it becomes `bridge.log.1` (the previous one is replaced) and a new file starts. This folder is part of no Pantin: if the Pantins folder is a git repository, add `.logs/` to its `.gitignore` (the core does not write that file).

Each line starts with the UTC time: `CORE INFO …` for core events (start requested, ready, stop), `CORE ERROR …` for a failure, `BRIDGE …` for lines written by the bridge. The Modbus bridge records accepted and closed connections (with the reason and the number of requests answered and refused) and each distinct refused request, for example:

```text
Module m1 refused a request from 10.0.0.5: unit 2, function 6, address 0, quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.
```

Only the first identical refused request is recorded per connection; the total is in the closing line. The file is also served by `GET /api/pantins/:pantinId/bridge/log` (with `?download=1` to download it) and is read without the core by the `pnpm pantin bridge-log` command (see [Connect a PLC](/en/guide/connect-a-plc#reading-the-bridge-log)). A bridge started outside Pantin has no file.

## The console

The console is a panel under the central area. A handle above the console lets you change its height (**Resize the console**); a double-click on the handle restores the original height. The height is kept in the browser.

At the very bottom of the central area, a thin always-visible bar holds the console counter (error and warning icons with two numbers, outside the toolbar): a click opens or closes the console, like **F8**. The button is pressed (blue tint and underline) when the console is open.

| Control | What it does | Greyed out when |
| --- | --- | --- |
| Title **Pantin console** | Name of the panel. | Not applicable |
| **Error** / **Warning** / **Info** (filters) | Three toggle buttons: show or hide the lines of this level. Pressed = shown. **Trace** lines have no filter: they follow **Verbose**. | Never |
| **Verbose** | Toggle button: writes a trace line each time a sensor changes (see [Verbose mode](#verbose-mode)). Pressed = on. The choice is a viewer preference, kept in the browser. | Never |
| **Clear** | Hides the lines read so far, in this viewer only; the core keeps its history. | No line read (filters that hide every line do not grey it out) |
| **Export** | Saves the lines shown, as displayed (level filters and **Clear** included), in a text file `console-<Pantin>.txt`. | No line shown |
| **Close the console** (cross) | Closes the panel. | Never |
| List of lines | One line per event: simulation time, level, source, text, detail and repeat counter. | Not applicable |

A line whose source still exists is clickable: a click (or **Enter**) selects the source (a drive, a joint...). A deleted source is shown as **(deleted)**. When nothing is displayed, the list says **Nothing to report for this Pantin.** or **No line for the levels shown.**

The console reports in particular: a PLC write ignored on a forced tag, an error in a simulation step, a diagnostic that appeared or cleared, a fault injected or removed, a document migrated on opening, a file modified outside Pantin (**pantin.json modified outside Pantin. Saving will overwrite it.**, one line for each new content), a pause or a resume, a blocked emitter, the product limit reached, the connections and disconnections of the PLC and of the bridge, and the warning or error lines of the bridge log, as `PLC bridge: <message>` (information lines stay in the log file).

### Verbose mode

![The console in Verbose mode: two Trace lines, one sensor dropping to 0 then the other changing to 1](/screenshots/en/console-verbose.webp)

While **Verbose** is pressed, each change of the feedback bit of a sensor (a joint range detector or a presence sensor) writes a line of level **Trace**: "Tag `<tag>` changes to 0" or "... to 1". The source is the sensor, and a click on the line selects it. A counter, such as an encoder's `count`, is not traced.

- A trace line has its own glyph (a prompt chevron followed by dashes), the word **Trace** and a dashed edge: colour is never the only cue.
- Trace lines are not counted in the error and warning counter, and are not sent to the PLC bridge: the PLC already has the tag values.
- The mode changes nothing in the simulation. It works while running, paused, or stepping: each step you ask for writes its trace lines.
- At most 120 trace lines per window of 120 steps. Beyond that, the extra lines are left out, and an info line says "Verbose mode: N trace line(s) left out, too many sensor changes in a few steps."
- When the console is full, the oldest trace line goes first, before any error or warning.
- Turned off, **Verbose** also hides the trace lines already received, and the core writes no more; a count of left-out lines still pending is then discarded, with no info line. It is off by default. The viewer sends its choice to the core when a Pantin is opened.

## The welcome window

![The welcome window, Home tab](/screenshots/en/welcome.webp)

It is displayed when no Pantin is open. It is a modal window above the empty 3D view. **Esc** or the **Close the welcome window** cross hides it; **File**, **Welcome** brings it back. Two tabs, with the left and right arrows to switch between them.

### Home tab

| Control | What it does |
| --- | --- |
| **Empty Pantin** | Opens a **Name of the new Pantin** field. **Enter** or the **Create** button (tick) creates and opens the Pantin; **Cancel** (cross) or **Esc** closes the field. |
| **From a 3D file** | Opens the file picker, creates a Pantin bearing the file's name, then opens the [import form](#the-import-form). |
| **Examples** | One card per example the core offers: its name, its body count and the word **Example**. A click opens a **Name of your copy of** followed by the example's name field, filled with the example's name. **Enter** or the **Create** button (tick) copies the example into the Pantins folder and opens the copy; **Cancel** (cross) or **Esc** closes the field. A second click on the card closes the field too. The section is hidden when the core offers none (see below). |
| **Recent** | Up to six cards (name, body count, modification date), most recent first. A click opens the Pantin. With no Pantin: **No Pantin yet. Create one above.** |
| **Resources** | Links that open in a new tab: **Project repository**, **Guides**, **Design decisions**. |
| **Keyboard shortcuts** | Reminder of the main shortcuts. |

### All Pantins tab

| Control | What it does |
| --- | --- |
| **Filter by name or id** | Search field, case-insensitive. Empty: everything is kept. |
| **Pantin list** | One row per Pantin: name, identifier, body count and date. A click selects; a double-click, **Enter** or the **Open** button opens. The arrows, **Home** and **End** move the selection. |
| Empty texts | **No Pantin yet. Create one from the Home tab.**; **No Pantin matches the filter.** |

#### Copying an example

- The original example is never changed: the viewer works on a copy, stored in the Pantins folder like a created Pantin. A second copy of the same example gets a different identifier (`plc-cylinder`, then `plc-cylinder-2`).
- The copy holds `pantin.json`, the meshes (`meshes/`) and `io.json` if there is one. The example's `README` and any other file are not copied.
- The core offers valid examples only. An invalid example folder (unreadable document, unreadable `io.json`, a mesh that is missing, too large or outside the folder, a symbolic link) is not listed; the reason is written to the core's log.
- The section appears only if the core is started with `--examples-dir <folder>`. `pnpm serve` adds it; see [Install and start](/en/guide/fundamentals#install-and-start).
- If the copy fails, the field stays open with the typed name and the message line says what to do: **The core no longer offers this example. Reload the page to refresh the list.** (example removed or section disabled); **The example could not be copied because of a conflict. Choose another name and try again.** A copy that fails while being written leaves no folder behind.

The window's errors (unsupported file, unreachable core...) are shown in the window's message line.

At the bottom of the window, a **Pantin** line followed by the number shows the viewer version.

## The About window

It opens with **Help**, **About Pantin…**. It is a modal window above the central area. <kbd>Esc</kbd> or the **Close the About window** cross closes it.

| Line | What it shows |
| --- | --- |
| **Viewer version** | The version of the viewer loaded in the browser. |
| **Core version** | The version of the core, read each time the window opens: **Reading…** while it is read, **Core unreachable** if the core does not answer. |
| **Licence** | Apache 2.0. |
| **User guide**, **Project repository** | Links, opened in a new tab. |

A number such as `0.2.0` is a released version. A number such as `0.2.0+8b4e4c4` is a state of the code built after version 0.2.0; what follows the `+` is the commit.

If the viewer and the core do not have the same number, a message preceded by a warning triangle says so: the browser kept an old viewer after the core was updated. Reload the page with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>. See [Troubleshooting](/en/guide/troubleshooting#the-viewer-and-the-core).
