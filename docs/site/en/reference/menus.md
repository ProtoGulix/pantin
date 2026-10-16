# Menus

The menu bar contains three menus: **File**, **Edit** and **View**. This page lists every entry in the order in which it appears. Separators are shown as a "separator" line.

A greyed-out entry does nothing when you click it, and neither does its shortcut. An entry with a box (•) can be ticked: the bullet shows the current state. See [Shortcuts](/en/reference/shortcuts) for keyboard navigation in the menus.

::: info Ctrl or Cmd
Shortcuts with Ctrl are displayed as "Ctrl+..." in the menus, but the viewer also accepts the <kbd>Cmd</kbd> key (macOS) instead.
:::

Terms used in the "Greyed out when" column:

- **No Pantin open**: no Pantin is open (the welcome window is displayed).
- **Working**: a request to the core is in progress (the toolbar's working indicator is displayed).

## File

| Entry | Shortcut | What it does | Greyed out when |
|---|---|---|---|
| **Welcome** | | Shows the welcome window. | A Pantin is open. |
| **Open…** | | With a Pantin open, closes it to go back to the welcome window: if it has unsaved changes, a confirmation question is shown. The welcome window then opens on the last tab used (**Home** the first time). With no Pantin open, shows the welcome window on the **All Pantins** tab. | Working. |
| **Save** | <kbd>Ctrl</kbd>+<kbd>S</kbd> | Saves the open Pantin. | No Pantin open, no unsaved changes, or working. |
| **Import…** | | Opens the file picker to import a 3D model (GLB, STL, STEP) into the open Pantin. | No Pantin open, working, or an import already in progress. |
| **Clean up orphan files…** | | Offers to delete the orphan files of the Pantin's meshes folder that no body uses (after confirmation). | Same conditions as **Import…**. |
| separator | | | |
| **Close** | | Closes the Pantin and goes back to the welcome window. A question is shown if there are still unsaved changes. | No Pantin open. |

## Edit

| Entry | Shortcut | What it does | Greyed out when |
|---|---|---|---|
| **New joint…** | | Opens the joint creation form. | No Pantin open, no body in the Pantin, or working. |
| **Reset the simulation** | | Puts the simulation back to its initial state. | No Pantin open or working. |
| **Release all forced tags** | | Releases all the tags forced from the viewer. No effect if no tag is forced. | No Pantin open or working. |
| separator | | | |
| **Rename** | <kbd>F2</kbd> | Renames the selected element. | The selection is not a Pantin, nor a body, nor an element of the action chain (drive, actuator, sensor, belt...). An assembly cannot be renamed through this menu: use <kbd>F2</kbd> in the tree or its context menu. |
| **Delete** | <kbd>Del</kbd> | Deletes the selected element (body, joint or element of the action chain). For a body or a joint, a confirmation question is shown. A drive still linked to an actuator is refused by the core. | The selection is not a body, nor a joint, nor an element of the action chain, or working. |
| separator | | | |
| **Move** (box) | <kbd>G</kbd> | Turns the move gizmo of the selected assembly on or off. With a body selected, the selection moves to its assembly. | No usable assembly is selected. |
| **Rotate** (box) | <kbd>R</kbd> | Turns the rotation gizmo on or off. | Same. |
| **Assembly's own axes** (box) | <kbd>L</kbd> | Ticked: the gizmo follows the assembly's own axes. Unticked: it follows the world axes. | Same. |
| **Align…** (box) | <kbd>A</kbd> | Starts or stops the alignment tool for the selected assembly. | No usable assembly is selected and no alignment is in progress. |

The **Move**, **Rotate** and **Align…** tools are detailed in [Panels and buttons](/en/reference/panels).

## View

| Entry | Shortcut | What it does | Greyed out when |
|---|---|---|---|
| **Frame all** | <kbd>F</kbd> | Frames the 3D view on all the bodies. | No body, or the 3D view is not displayed (layouts **Chain diagram only** and **I/O alone**). |
| **Frame selection** | | Frames the 3D view on the selected element. | No body, no selection, selection of an element of the action chain, or 3D view not displayed. |
| separator | | | |
| **Front** | <kbd>Ctrl</kbd>+<kbd>1</kbd> | Turns the camera to the front view, in 300 ms. | No Pantin open or 3D view not displayed. |
| **Back** | <kbd>Ctrl</kbd>+<kbd>2</kbd> | Back view. | Same. |
| **Left** | <kbd>Ctrl</kbd>+<kbd>3</kbd> | Left view. | Same. |
| **Right** | <kbd>Ctrl</kbd>+<kbd>4</kbd> | Right view. | Same. |
| **Top** | <kbd>Ctrl</kbd>+<kbd>5</kbd> | Top view. | Same. |
| **Bottom** | <kbd>Ctrl</kbd>+<kbd>6</kbd> | Bottom view. | Same. |
| **Isometric** | <kbd>Ctrl</kbd>+<kbd>7</kbd> | Isometric view. | Same. |
| separator | | | |
| **Inspector** (box) | | Shows or hides the inspector. Ticked when it is displayed. | No Pantin open. |
| **Console** (box) | <kbd>F8</kbd> | Shows or hides the console. | No Pantin open. |
| separator | | | |
| **Cycle the central view** | <kbd>F4</kbd> | Goes to the next layout: **3D + Diagram**, **3D only**, **Chain diagram only**, then **3D + Diagram** again. The **I/O alone** layout is outside this cycle: <kbd>F4</kbd> leaves it for **3D + Diagram**. | No Pantin open. |
| **3D only** (box) | | Chooses this layout. | No Pantin open. |
| **Chain diagram only** (box) | | Chooses this layout. | Same. |
| **3D + Diagram** (box) | | Chooses this layout (the default one). | Same. |
| **I/O alone** (box) | | Chooses this layout (I/O list). | Same. |
| separator | | | |
| **Perspective** (box) | | Switches the camera between perspective and orthographic projection. | Never. |
| **Mouse: SolidWorks** (box) | | Chooses the SolidWorks mouse configuration. | Never. |
| **Mouse: ZW3D** (box) | | Chooses the ZW3D mouse configuration. | Never. |
| **Reverse wheel direction** (box) | | Reverses the direction of the wheel zoom. | Never. |
| **Arrow step: 5°** (box) | | The keyboard arrows turn the view by 5° in the 3D view. | Never. |
| **Arrow step: 15°** (box) | | Same, 15°. | Never. |
| **Arrow step: 45°** (box) | | Same, 45°. | Never. |
| separator | | | |
| **Language: FR** (box) | | Switches the interface to French. | Never. |
| **Language: EN** (box) | | Switches the interface to English. | Never. |

The mouse settings are detailed in [Shortcuts](/en/reference/shortcuts#_3d-view-and-camera-navigation).

## Tree context menu

A right-click on a row of the tree, or the <kbd>Menu</kbd> key of the keyboard, opens the menu of that row. Its title is `Actions on "name"`. The entries depend on the row type:

| Row type | Entries, in order |
|---|---|
| Pantin | **Rename**, **Frame the view on this item**, **Import into this Pantin**, **New assembly** |
| Assembly | **Rename**, **Frame the view on this item**, **New joint…**, **Hide in the 3D view** (becomes **Show in the 3D view** if it is hidden), **Isolate in the 3D view** (becomes **Show every assembly** if it is isolated), **Delete** |
| "Joints between assemblies" folder | **Frame the view on this item**, **New joint…** |
| Body | **Rename**, **Frame the view on this item**, **Delete** |
| Joint | **Frame the view on this item**, **Change type…**, **Add an actuator…** (becomes **Edit its actuator…** if it has one), **Add a sensor…**, **Add end-of-stroke switches**, **Delete** |
| Element of the action chain (drive, actuator, sensor, belt...) | **Edit**, **Show in I/O**, **Delete** |
| Other rows (source file node, element family) | **Frame the view on this item** |

Details, from the code:

- **Rename** is offered only for a renamable row (Pantin, assembly, body).
- On a fixed joint, the entries **Add an actuator…**, **Add a sensor…** and **Add end-of-stroke switches** are not offered. **Add end-of-stroke switches** is not offered either on a joint without limits (continuous pivot).
- **Show in I/O** is offered only for an element that can own tags.
- An absent entry is not greyed out: it does not appear.

The menu closes with <kbd>Esc</kbd> or with a click elsewhere.
