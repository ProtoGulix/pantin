# Menus

The menu bar contains four menus: **File**, **Edit**, **View** and **Help**. Every entry, in the order in which it appears; a separator is a "separator" line.

A greyed-out entry does nothing, nor does its shortcut. An entry with a box (•) can be ticked: the bullet shows the state. See [Shortcuts](/en/reference/shortcuts) for keyboard navigation in the menus.

::: info Ctrl or Cmd
The menus show "Ctrl+..."; on macOS, <kbd>Cmd</kbd> works too.
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
| **Group…** | | Creates a group with the bodies and sub-groups selected in the tree: a line asks for the name of the group. See [Make a group](/en/guide/groups#make-a-group). | The selection is not made of bodies and sub-groups of one assembly, or working. |
| **Ungroup** | | Dissolves the selected group into the assembly where it is filed. See [Ungroup a group](/en/guide/groups#ungroup-a-group). | The selected row is not an assembly filed inside another assembly, or working. |
| **Delete redundant fixed joints…** | | Lists the fixed joints that have become useless (between bodies of one assembly, with no moving joint above the parent) and deletes them after confirmation. Acts on the whole Pantin. See [Clean up old fixed joints](/en/guide/groups#clean-up-old-fixed-joints). | No Pantin open, import running or working. |
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
| **Frame all** | <kbd>F</kbd> | Frames the 3D view on all the bodies. | No body, or the 3D view is not displayed (the 3D view is shown in no zone). |
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
| **Next view in the top zone** | <kbd>F4</kbd> | Moves the top zone to the next view, in the order **3D**, **Diagram**, **Joints**, **I/O**, then **3D** again, skipping the view the bottom zone shows. | No Pantin open. |
| **Top zone: 3D** (box) | | Shows this view in the top zone. Ticked for the current view of that zone. | No Pantin open, or the view is already shown in the bottom zone. |
| **Top zone: Diagram** (box) | | Same. | Same. |
| **Top zone: Joints** (box) | | Same. | Same. |
| **Top zone: I/O** (box) | | Same. | Same. |
| **Bottom zone: 3D** (box) | | Shows this view in the bottom zone, and opens that zone if it is closed. | No Pantin open, or the view is already shown in the top zone. |
| **Bottom zone: Diagram** (box) | | Same. | Same. |
| **Bottom zone: Joints** (box) | | Same. | Same. |
| **Bottom zone: I/O** (box) | | Same. | Same. |
| **Open the bottom zone** | | Opens the bottom zone, on the first view the top zone does not show. | No Pantin open, or the bottom zone is already open. |
| **Close the bottom zone** | | Closes the bottom zone. | No Pantin open, or the bottom zone is already closed. |
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
| **Theme: System** (box) | | Follows the browser's light or dark theme; this is the default. | Never. |
| **Theme: Light** (box) | | Forces the light theme. | Never. |
| **Theme: Dark** (box) | | Forces the dark theme. | Never. |

The mouse settings are detailed in [Shortcuts](/en/reference/shortcuts#_3d-view-and-camera-navigation).

## Help

| Entry | Shortcut | What it does | Greyed when |
|---|---|---|---|
| **Documentation** | | Opens this guide in a new tab, in the viewer's language. | Never. |
| **About Pantin…** | | Opens the **About Pantin** window. See [Panels and buttons](/en/reference/panels#the-about-window). | Never. |

## Tree context menu

A right-click on a row of the tree, or the <kbd>Menu</kbd> key of the keyboard, opens the menu of that row. A right-click on a group, a body or a joint of the [Joints view](/en/reference/views#the-joints-view), or <kbd>Shift</kbd>+<kbd>F10</kbd> on one of them, opens the same menu. Its title is `Actions on "name"`. The entries depend on the row type:

| Row type | Entries, in order |
|---|---|
| Pantin | **Rename**, **Frame the view on this item**, **Import into this Pantin**, **New assembly**, **Delete redundant fixed joints…** |
| Assembly | **Rename**, **Frame the view on this item**, **New joint…**, **Group…** (if the selection allows it), **Ungroup** (assembly filed inside another), **Hide in the 3D view** (becomes **Show in the 3D view** if it is hidden), **Isolate in the 3D view** (becomes **Show every assembly** if it is isolated), **Delete** |
| "Joints between assemblies" folder | **Frame the view on this item**, **New joint…** |
| Body | **Rename**, **Frame the view on this item**, **Group…** (if the selection allows it), **Delete** |
| Joint | **Frame the view on this item**, **Change type…**, **Add an actuator…** (becomes **Edit its actuator…** if it has one), **Add a sensor…**, **Add end-of-stroke switches**, **Delete** |
| Element of the action chain (drive, actuator, sensor, belt...) | **Edit**, **Show in I/O**, **Delete** |
| Other rows (source file node, element family) | **Frame the view on this item** |

Details:

- **Group…** is offered on a body or assembly row when the selection (one or several rows of one assembly) can be grouped. **Ungroup** is offered only on the first selected row.
- **Rename** is offered only for a renamable row (Pantin, assembly, body).
- On a fixed joint, the entries **Add an actuator…**, **Add a sensor…** and **Add end-of-stroke switches** are not offered. **Add end-of-stroke switches** is not offered either on a joint without limits (continuous pivot).
- **Show in I/O** is offered only for an element that can own tags.
- An absent entry is not greyed out: it does not appear.

The menu closes with <kbd>Esc</kbd> or with a click elsewhere.
