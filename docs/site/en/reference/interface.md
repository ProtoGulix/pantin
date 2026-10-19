# The screen

The areas of the window, from top to bottom and from left to right. Names in **bold** are those of the interface.

![The viewer with the plc-cylinder example open: tree on the left, 3D view and diagram in the centre, inspector on the right](/screenshots/en/overview.webp)

```
+----------------------------------------------------------------------+
| File   Edit   View                                       (menu bar)  |
+--------------------+-------------------------------------+-----------+
| Toolbar            | Transport bar                       |           |
|--------------------|-------------------------------------|           |
| Tree               |                                     |           |
|  (Pantin,          |  Top zone: one view                 | Inspector |
|   assemblies,      |  (3D, Diagram, Joints or I/O)       |           |
|   bodies, joints,  |- - - - - - - - - - - - - - - - - - -|           |
|   elements)        |  Bottom zone (optional)             |           |
|                    |-------------------------------------|           |
|--------------------| Console + counter bar               |           |
| PLC bridge         |                                     |           |
+--------------------+-------------------------------------+-----------+
```

The splitters between the left column, the central area and the inspector move with the mouse or the keyboard (see [Shortcuts](/en/reference/shortcuts)). The detail of each panel is in [Panels and buttons](/en/reference/panels), that of each view in [Central views](/en/reference/views).

## The menu bar

It occupies the top of the window and contains four menus: **File**, **Edit**, **View** and **Help**. A menu opens on click and is navigated with the arrows. Common shortcuts are displayed in it. See [Menus](/en/reference/menus).

## The toolbar

It is at the top of the left column, when a Pantin is open. It gathers the quick-access buttons: back to the welcome window (**Close the Pantin**), **Save**, import of a 3D file and framing. An indicator shows that a request is in progress. See [Panels and buttons](/en/reference/panels).

## The left side panel

It exists only when a Pantin is open. From top to bottom: the toolbar, the import form, the **Pantin tree**, the **PLC bridge** card, then the confirmation question and the message line when there are any. The other forms (joint, actuator, sensor...) open in the inspector.

- The tree lists the Pantin, its assemblies, its bodies, its joints and the elements of the action chain. A right-click opens the element's menu (see [Menus](/en/reference/menus#tree-context-menu)).
- The **PLC bridge** card shows the state of the Modbus bridge and of its modules. See [Connect a PLC](/en/guide/connect-a-plc).

## The central view

It has a top zone and, if you open it, a bottom zone. Each zone shows one view at a time, among **3D**, **Diagram**, **Joints** and **I/O**, chosen with the selector at the top left of the zone. A view is shown in one zone at a time. By default, the 3D view is on top and the diagram below. The **View** menu offers the same choices, and <kbd>F4</kbd> moves the top zone to the next view. With no Pantin open, the 3D view takes up the whole area. See [Central views](/en/reference/views).

In the 3D view, a view cube lets you choose a standard view with one click.

## The inspector

The right-hand column; it is shown and hidden with **View** then **Inspector**. It shows the properties of the selected element, its tags, the forcing buttons and the placement tools. See [Panels and buttons](/en/reference/panels).

## The transport bar

![The transport bar: Pause, 1 step, 10 steps, Reset, simulated time and step count](/screenshots/en/transport-bar.webp)

At the top of the central area, it controls the simulation time: pause and resume, advance by 1 or 10 steps, reset, simulated time, and a button that releases all forced tags (visible only while a tag is forced). A warning appears if the simulation falls behind real time. See [Panels and buttons](/en/reference/panels).

## The console

Under the central view, it is shown and hidden with **View** then **Console**, or with <kbd>F8</kbd>. It lists the messages of the Pantin, with filters by level and a clear button. Its top edge is a splitter: drag it to change its height. The error and warning counter is in a thin bar under the central area, never in the toolbar. See [Panels and buttons](/en/reference/panels).

## The question line and the message line

In the left panel, a confirmation question (closing with unsaved changes, deleting a body or a joint) is shown under the **PLC bridge** card. It takes the keyboard: <kbd>Enter</kbd> chooses the primary button, <kbd>Esc</kbd> cancels. The message line just below shows errors and confirmations.

## The welcome window

![The welcome window, Home tab](/screenshots/en/welcome.webp)

As long as no Pantin is open, a modal window **Welcome — Pantin** is displayed in the centre of the 3D view. It has two tabs:

- **Home**: create a Pantin (**Empty Pantin** or **From a 3D file**), the **Recent** list, the **Resources** and the **Keyboard shortcuts** of the menu;
- **All Pantins**: the full list, with a filter field by name or identifier, and one open button per row.

Its footer shows the viewer version (**Pantin** followed by the number). It closes with its button or with <kbd>Esc</kbd>. **File** then **Welcome** reopens it on the last tab used (**Home** by default). **File** then **Open…** closes the open Pantin, if there is one, and the window then opens on the last tab used; with no Pantin open, it opens on **All Pantins**. See [Panels and buttons](/en/reference/panels).
