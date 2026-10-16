# Keyboard and mouse shortcuts

This page lists every keyboard and mouse gesture that the viewer's code handles, grouped by area. The menu entries are described in [Menus](/en/reference/menus).

::: info Ctrl or Cmd
Wherever the viewer reads a Ctrl shortcut, the <kbd>Cmd</kbd> key (macOS) works too. The exceptions are camera navigation and the gizmo drag, which test only <kbd>Ctrl</kbd> (see below).
:::

## Global (whole window)

These shortcuts are those of the menus. A shortcut with <kbd>Alt</kbd> added is never recognised. <kbd>Shift</kbd> is not tested: <kbd>Shift</kbd>+<kbd>G</kbd> acts like <kbd>G</kbd>.

| Gesture | Effect | Condition |
|---|---|---|
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | **Save** | Menu entry not greyed out. |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>Ctrl</kbd>+<kbd>7</kbd> | Views **Front**, **Back**, **Left**, **Right**, **Top**, **Bottom**, **Isometric** | Pantin open and 3D view displayed. |
| <kbd>F2</kbd> | **Rename** the selection | Menu entry not greyed out. |
| <kbd>Del</kbd> | **Delete** the selection | Menu entry not greyed out. |
| <kbd>G</kbd> | **Move** (move gizmo) | A usable assembly is selected (or a body: the selection then moves to its assembly). |
| <kbd>R</kbd> | **Rotate** (rotation gizmo) | Same. |
| <kbd>L</kbd> | **Assembly's own axes** | Same. |
| <kbd>A</kbd> | **Align…** | Same, or alignment in progress. |
| <kbd>F</kbd> | **Frame all** | Bodies present and 3D view displayed. |
| <kbd>F4</kbd> | **Cycle the central view** | Pantin open. |
| <kbd>F8</kbd> | **Console** | Pantin open. |
| <kbd>Esc</kbd> | Ends the placement tool in progress (gizmo, alignment, axis pick) | See the Escape chain below. |
| <kbd>Space</kbd> or <kbd>Shift</kbd>+<kbd>Space</kbd> | Opens the list of standard views at the pointer's position | See "3D view". |

In an input field (text, number, list), none of these shortcuts runs: the keys keep their normal meaning. One exception on the browser side: <kbd>Ctrl</kbd>+<kbd>S</kbd> and <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>7</kbd> are always intercepted, even when greyed out or in a field, so that the browser neither saves the page nor changes tab. In a field, they then run nothing.

Single-key shortcuts (<kbd>F2</kbd>, <kbd>Del</kbd>, <kbd>G</kbd>...) give way to a component that has already handled the key (tree, menus, diagram, console).

### The Escape chain

<kbd>Esc</kbd> acts on the nearest component, in this order: a placement gizmo drag (it goes back to the starting position; this listener is attached to the document, in the capture phase, so it goes before everything else), an input field (it restores its value), a confirmation question (it chooses cancel), a menu or a context menu (it closes), then the active placement tool (gizmo, alignment, axis pick). <kbd>Esc</kbd> does not end the tool when a context menu is open, nor when a field has focus.

::: info Known behaviour: wiring in the diagram
A wiring in progress in the diagram is abandoned by <kbd>Esc</kbd>, but this listener is attached after the one for the window shortcuts. If a placement tool is active at that moment, the same <kbd>Esc</kbd> therefore abandons the wiring and also turns the tool off.
:::

## Menu bar

| Gesture | Effect |
|---|---|
| Click on a menu title | Opens the menu, or closes it if it is already open. |
| Hover over another title, menu open | Opens that menu instead. |
| Click on an entry | Runs the entry if it is not greyed out; the menu closes. |
| Click elsewhere in the window | Closes the menu. |
| <kbd>→</kbd> / <kbd>←</kbd> on the bar | Goes to the next or previous menu, wrapping around at the end. If a menu is open, the neighbour opens on its first entry. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | On a title, opens the menu on its first entry. In a menu, next or previous entry, wrapping around at the end. |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | On a title, opens the menu. On an entry, runs it (no effect if it is greyed out). |
| <kbd>Esc</kbd> | Closes the menu and puts the focus back on its title. |
| <kbd>Tab</kbd> | The bar is a single tab stop: <kbd>Tab</kbd> comes back to the last menu you were on. |

## Tree

The arrows act when the tree has focus; the selected item follows the focus.

| Gesture | Effect |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next or previous row (with no selection: first or last). |
| <kbd>Home</kbd> / <kbd>End</kbd> | First or last row. |
| <kbd>→</kbd> | Unfolds the row; if it is already unfolded, goes to its first child. |
| <kbd>←</kbd> | Folds the row; if it is already folded, goes to its parent. |
| <kbd>Enter</kbd> | Activates the row: the inspector opens on it, and a foldable row toggles between unfolded and folded. |
| <kbd>F2</kbd> | Renames the row (if it is renamable). |
| <kbd>Menu</kbd> (context key) | Opens the row's context menu. |
| Click | Selects the row (the selection is made on press). |
| Click on the chevron | Unfolds or folds the row. |
| Click on the eye | Hides or shows the assembly in the 3D view. |
| Click on a joint's actuator icon | Opens the form of its actuator. |
| Click on a joint's sensor icon | Opens the form of its first sensor. |
| Double-click | Renames the row if it is renamable, otherwise activates it like <kbd>Enter</kbd>. |
| Right-click | Opens the row's context menu. |
| Drag a body onto an assembly (or onto a body) | Moves the body into that assembly. Only body rows can be dragged. |
| During a rename: <kbd>Enter</kbd> | Validates, and the focus goes back to the tree. |
| During a rename: <kbd>Esc</kbd> | Cancels and restores the name. |
| During a rename: click elsewhere | Validates the name. |

### Context menu (tree, standard views, diagram ports)

These three lists are operated the same way.

| Gesture | Effect |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next or previous entry, wrapping around at the end. |
| <kbd>Esc</kbd> | Closes the menu. |
| Click on an entry | Runs it. |
| Click elsewhere | Closes the menu. |

The tree's context menu opens with the focus on its first entry when you open it from the keyboard. It is placed at the pointer and kept inside the window. The diagram's menu also closes with <kbd>Tab</kbd>.

## 3D view and camera navigation

### Mouse

The left button has no camera role: a click selects, and dragging in empty space does nothing. A "click" is a press without movement, so turning the camera never selects. The **View** menu chooses the configuration.

| Gesture | Mouse: SolidWorks | Mouse: ZW3D |
|---|---|---|
| Middle button, drag | Turns the camera | Pans the view |
| <kbd>Ctrl</kbd> + middle button, drag | Pans the view | Pans the view |
| <kbd>Shift</kbd> + middle button, drag | Zoom (up-down) around the aimed point | Pans the view |
| Right button, drag | No camera effect | Turns the camera |
| Wheel | Zoom around the cursor | Zoom around the cursor |

Details:

- With **Mouse: ZW3D**, only the middle button alone and the right button are assigned; the modifiers change nothing.
- For the wheel direction, with **Mouse: SolidWorks** pushing the wheel forward zooms out; with **Mouse: ZW3D** it is the opposite. **Reverse wheel direction** (**View** menu) flips the direction in both cases.
- The browser's context menu is suppressed on the 3D view, so that the right button can be used for the camera.
- Rotation is made around the point of a body under the cursor at the time of the press, if there is one.
- A press on the view interrupts a view animation in progress.

::: warning Not verified
The ZW3D wheel direction is not verified (spike 0007): the Babylon.js one is used.
:::

### Selection

| Gesture | Effect |
|---|---|
| Click on a body | Selects the matching item in the tree. |
| Double-click on a body | Goes down one level: the click selects the body's top-level assembly, each double-click selects the assembly one level below, down to the body itself. A body with no assembly is selected directly. If an ancestor assembly of the body is already selected, a single click keeps it. |
| Click on a belt, a guide, an emitter, an absorber or a presence sensor | Selects that element. |
| Click in empty space | Deselects, unless a placement tool is active. |
| During alignment | A click picks a body for the alignment (a double-click counts as a single pick). |

### Keyboard (the 3D view has focus)

The arrows drive the camera only when the 3D view has focus (a click on it gives it the focus), so that the arrows keep working in the tree and the fields.

| Gesture | Effect |
|---|---|
| <kbd>←</kbd> / <kbd>→</kbd> | Turns the view around the vertical axis, by the chosen step (**Arrow step**: 5°, 15° or 45°). |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Turns the view up or down, by the same step. |
| <kbd>Shift</kbd> + arrow | Turns by a quarter turn (90°). |
| <kbd>Ctrl</kbd> + arrow | Pans the view by a fraction of the visible height. |
| <kbd>Space</kbd> or <kbd>Shift</kbd>+<kbd>Space</kbd> | Opens the list of standard views at the pointer (**Front** ... **Isometric**). Acts only if nothing in particular has focus (page or 3D view), without <kbd>Ctrl</kbd>, <kbd>Alt</kbd> or <kbd>Cmd</kbd>, outside an input field, with a Pantin open and the 3D view displayed. |
| <kbd>↓</kbd> / <kbd>↑</kbd>, <kbd>Esc</kbd> in this list | Next or previous entry; close. |

<kbd>Alt</kbd> and <kbd>Cmd</kbd> disable these arrow keys.

### View cube

| Gesture | Effect |
|---|---|
| Click on a face, an edge or a corner of the cube | Turns the camera towards that direction; the focus goes back to the 3D view. |
| Hover over a cell | Lights up all the cells that ask for the same view. |

## Placement gizmo

The gizmo (arrows and arcs on the assembly) is activated with <kbd>G</kbd> (move) or <kbd>R</kbd> (rotate).

| Gesture | Effect |
|---|---|
| Drag an arrow or an arc | Moves or rotates the assembly. The move is rounded to a 1 mm step, the rotation to 15°, by default. |
| <kbd>Ctrl</kbd> held during the drag | Disables the rounding: the value follows the pointer. |
| <kbd>Esc</kbd> during the drag | Cancels: the assembly goes back to its starting position. |
| <kbd>Esc</kbd> outside a drag | Ends the tool (see the Escape chain). |

## Chain diagram

The diagram can be navigated entirely from the keyboard: a single element of the diagram is a tab stop at a time, and the arrows move the focus. The keys below are handled only without <kbd>Ctrl</kbd>, <kbd>Alt</kbd> or <kbd>Cmd</kbd>.

| Gesture | Effect |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | Goes to the neighbour in that direction. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First or last node. |
| <kbd>Enter</kbd> on a node | Enters its connectors (first port). |
| <kbd>Enter</kbd> on a power port | Opens **Link to…** (menu of the possible targets; **Enter** links, **Esc** closes it again). |
| <kbd>Enter</kbd> on a numeric command | Opens the small field to type a value to force. |
| <kbd>Space</kbd> on a node | Selects the node. |
| <kbd>Space</kbd> on a boolean command | Toggles it (forces the tag). |
| <kbd>Esc</kbd> | Removes the selection from a link; on a port, goes back up to the node. |
| <kbd>Del</kbd> | Removes the link of the focused port, or the selected link; if there are several links, a menu offers which one to remove. Never deletes an element (see **Edit** then **Delete**): a message reminds this. |
| <kbd>F2</kbd> on an element node | Renames that element (drive, actuator, sensor). |
| <kbd>Menu</kbd> (context key) on a power port | Opens **Link to…**. |
| <kbd>Menu</kbd> on the command of a forced tag | Opens a one-entry menu that releases the tag. |
| Click on a node | Selects the node. |
| Click on a boolean command | Toggles it. |
| Click on a numeric command | Opens the input field. |
| Click on a link | Selects the link. |
| Click on a band's header (chevron and assembly name) | Folds or unfolds the band; <kbd>Enter</kbd> or <kbd>Space</kbd> do the same on the keyboard. |
| Drag from the source end of a link to a target | Creates the link. The possible targets light up, the others fade. A press that moves by less than 4 pixels stays a click. |
| <kbd>Esc</kbd> during the drag | Abandons the wiring. |

A diagram key that nothing handled does not reach the window shortcuts: <kbd>Del</kbd> shows the help above and <kbd>F2</kbd> is ignored, so as not to act on the selection in place of the element that has focus.

### Value field of a numeric command

| Gesture | Effect |
|---|---|
| <kbd>Enter</kbd> | Sends the value (a decimal comma is accepted). An invalid value keeps the field open, marked invalid. |
| <kbd>Esc</kbd> | Closes without writing; the focus goes back to the port. |
| Leaving the field | Closes without writing. |
| Scrolling the diagram | Closes the field. |

In this field, the keys are neither window shortcuts nor diagram shortcuts.

## Input fields

| Gesture | Effect |
|---|---|
| <kbd>Enter</kbd> in a rename or edit field | Validates. The field loses focus (which goes back to the tree for a rename). |
| <kbd>Esc</kbd> | Restores the original value and leaves the field. |
| Leaving the field | Validates (except in creation forms, where leaving creates nothing). |
| <kbd>Enter</kbd> in a tag value field of the inspector | Sends the value. |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> in a field of the joint form | Validates / cancels the form. |

All these fields stop the propagation of keys: the window shortcuts do not fire while typing.

## Splitters

Four splitters resize the window: between the left column and the central area, between the central area and the inspector, at the top edge of the console, and, in the **3D + Diagram** layout, between the 3D view and the diagram.

| Gesture | Effect |
|---|---|
| Drag | Resizes; the size is remembered by the browser. |
| <kbd>←</kbd> / <kbd>→</kbd> (vertical splitters) | Moves by 16 pixels. |
| <kbd>↑</kbd> / <kbd>↓</kbd> (console splitter) | Moves by 16 pixels: <kbd>↑</kbd> raises the edge, so it enlarges the console. |
| <kbd>↑</kbd> / <kbd>↓</kbd> (horizontal 3D / diagram splitter) | Moves by 16 pixels. |
| Double-click | Goes back to the default size. |
| Focus | Each splitter is a tab stop (it has keyboard focus). |

## Console

The lines form a list: a single tab stop, on the last line you were on (otherwise the most recent).

| Gesture | Effect |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next or previous line. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First or last line. |
| <kbd>Enter</kbd> | Selects the message's source (if the line has one). |
| Click on a line | Same. |
| Click on a level filter | Shows or hides that level. |
| Click on the clear button | Hides the lines read so far in this viewer; the core keeps them (greyed out if there is nothing to clear). |
| Click on the cross | Closes the console. |

In the console, <kbd>F2</kbd> and <kbd>Del</kbd> do not fire the window shortcuts (they would act on the selection, not on the line).

## Confirmation question

| Gesture | Effect |
|---|---|
| Question appears | The focus goes to the primary button: <kbd>Enter</kbd> chooses it. |
| <kbd>Esc</kbd> | Chooses cancel (the choices that cancel). No effect if the question is disabled by a request in progress. |

## Welcome window

The window is modal: the focus stays inside it.

| Gesture | Effect |
|---|---|
| <kbd>Esc</kbd> | Closes the window. |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Goes to the next or previous control, wrapping around at the end. |
| <kbd>←</kbd> / <kbd>→</kbd> on a tab | Goes to the other tab (**Home** / **All Pantins**). |
| <kbd>Home</kbd> / <kbd>End</kbd> on a tab | First tab (**Home**) / last tab (**All Pantins**). |
| <kbd>↓</kbd> in the filter field | Puts the focus on the list. |

### Pantin list (All Pantins tab)

| Gesture | Effect |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next or previous row (with no selection: first or last). |
| <kbd>Home</kbd> / <kbd>End</kbd> | First or last row. |
| <kbd>Enter</kbd> | Opens the selected Pantin. |
| Click | Selects the row (on press). |
| Double-click | Opens the Pantin. |
| Click on the row's open button | Opens the Pantin. |

## Other fields

| Gesture | Effect |
|---|---|
| Slider of a joint (inspector) | A drag sends the position to the joint; during the drag, the simulation stream does not bring the slider back. |
| Click on a checkbox or toggle button of an inspector row | Forces the bit or toggles the fault. |

::: warning Not verified
The panel forms (actuator, sensor, belt, I/O module, bridge) have not been re-read line by line for their own keys; those of the joint and of the property rows are covered above.
:::
