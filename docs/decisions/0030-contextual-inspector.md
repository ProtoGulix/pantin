# 0030. One contextual inspector, and the diagram under the 3D view

- Status: accepted
- Date: 2026-10-01
- Amended by: ADR 0039 (point 2: assembly, body and joint; width and open
  state)
- Depends on: ADR 0028, ADR 0029
- Amends: ADR 0028 (point 13: the right-hand panel), ADR 0029 (points 5, 7,
  9 and 10: edge labels, keyboard, selection, place in the viewer and
  render loop)

## Context

ADR 0028 and 0029 are built. On 2026-10-01 the user found the right-hand
panel and the chain diagram redundant: the panel repeats what the diagram
draws better (an actuator's feed, the joint a sensor watches, the joints an
actuator moves).

What only the panel offers: forcing a command tag, injecting a fault
(`unresponsive`, `jammed`), reading a live value, and the create, edit and
delete forms.

Facts checked in the viewer code on 2026-10-01:

- The left-hand "Propriétés" panel repeats the devices too: for a joint it
  shows an "Actionneur" group (the actuator, the drive feeding it and its
  command tags, `actuator-rows.ts`) and a "Capteurs" group
  (`properties-model.ts`); for a body it lists its joints as links.
- The two panels use two idioms: the left one a "Property | Value" grid
  with editing in place and groups whose collapsed state survives a change
  of selection (`property-rows.ts`), the right one sections and forms
  (`drive-panel-model.ts`, `actuator-panel-model.ts`,
  `sensor-panel-model.ts`).
- The selection is a tree node id (`selectedNodeId`), and the tree has no
  row for drives, actuators or sensors (`node-ids.ts`). Clicking a drive in
  the diagram selects the first joint downstream, or the Pantin
  (`diagram-selection.ts`).
- When a Pantin opens, or the selection disappears, the viewer selects the
  Pantin itself (`viewer-state.ts`): "nothing selected" barely happens.
- The "Édition" menu depends on the kind of the selected tree node:
  "Supprimer" acts on a body or a joint, "Renommer" on the Pantin or a body
  (`menu-model.ts`).
- Plain-key shortcuts (F2, Suppr) run in the bubble phase and give way to
  a component that handled the key first (`shortcuts.ts`). In the diagram,
  Delete always handles the key: it removes the focused link, or shows a
  hint, and never removes an element (`diagram-keys.ts`).
- In the diagram, Enter on a node focuses its first port, Enter on any port
  opens "Relier à…", and Space on a node selects it (`diagram-keys.ts`).
- Drive type `labels.ts` translate tags only; only actuator types label
  their ports.
- `jammed` is set from the actuator section of the panel
  (`actuator-panel-model.ts`), though it is a fault of the joint
  (ADR 0022 point 7).
- Sensor markers in the 3D view are not pickable (`sensor-markers.ts`):
  the 3D view selects bodies only.

Seen on the first build: edge labels (`port_2 → rod`) overlap between two
nodes, sensor nodes show the raw tag key `state`, and a migrated drive and
its actuator share one name (`verin1`).

The user chose on 2026-10-01: a panel that shows the selected element, and
forcing a coil by clicking its socket in the diagram. The same day the user
asked to see the 3D view and the diagram at once, the 3D view above, the
diagram below: forcing a coil in the diagram and watching the cylinder move
is the main use while testing a PLC program, and ADR 0029 point 10 made it
impossible (the split was in the backlog). Reviewing this ADR, the user
chose to merge the two panels into one inspector, to let the "Édition"
menu act on any selection, and to keep the diagram's Delete rule.

## Decision

1. **A selection that is not a tree node.** The viewer's selection becomes
   one of: a tree node (Pantin, folder, assembly, body, joint), a drive, an
   actuator or a sensor. The tree, the 3D view (bodies), the diagram and
   the inspector index all set it. Clicking a drive, actuator or sensor
   node in the diagram, or Space on it, selects that element, no longer the
   first joint downstream (replaces `diagram-selection.ts` behaviour). When
   a device is selected, the tree has no selected row; the joints it drives
   or watches are marked as related in the tree, as their bodies are
   highlighted in the 3D view (ADR 0029 point 9). When the selected element
   disappears, the selection moves to the Pantin, as for a tree node today.
2. **One inspector.** The right-hand panel becomes the only properties
   panel: it shows whatever is selected. The left-hand column keeps the
   tree only, which gains the height of the former "Propriétés" panel, and
   the viewer's notifications at its bottom. The inspector is a
   "Property | Value" grid in every case, with editing in place and groups
   with a stable id (the idiom of `property-rows.ts`); tags with their live
   values and forcing, faults and diagnostics are groups of that grid.
   Creating an element stays a form, since nothing is selected yet. By
   kind:
   - the Pantin and an assembly: their properties as today, then a compact
     index of the devices of that scope: one line per drive, actuator and
     sensor, with name, type and live state; a line selects its element.
     The "between assemblies" folder has no device and shows no index;
   - a body: its properties as today, with its joints as links;
   - a joint: its geometry, tag key and tags as today, its position,
     `jammed` (moved here from the actuator section), and links to its
     actuator and sensors;
   - a drive: type, parameters, command and feedback tags with their values
     and forcing, `unresponsive`, diagnostics (ADR 0028 point 5);
   - an actuator: type, parameters; its feed and joints are not repeated,
     the diagram shows them;
   - a sensor: type, parameters, state.
   The "New drive", "New actuator" and "New sensor" buttons stay at the
   head of the inspector in every case. Since the inspector shows the type
   of every element, two elements may share a name. It is built in two
   steps: first the selection of point 1 and the inspector for devices,
   the left-hand panel still showing tree nodes and, for a device, a line
   naming the element shown in the inspector; then the properties of tree
   nodes move into the inspector and the left-hand panel goes. Only the
   second step is the state this ADR decides.
3. **Forcing in the diagram.** Clicking a boolean command socket on a drive
   node toggles that tag through the existing tag write; the socket shows
   the value. A numeric command socket opens a small input on the socket,
   validated by Enter. Feedback sockets and sensor sockets are read only.
   Forcing a socket never selects the node, so that the inspector does not
   jump during a test. Keyboard, amending ADR 0029 point 7, by focus:
   - on a node, Enter focuses its first socket and Space selects the node
     (unchanged);
   - on a boolean command socket, Space toggles;
   - on a numeric command socket, Enter opens the input, prefilled with
     the current value; Escape, or leaving the input, closes it without
     writing;
   - on a power port (drive output, actuator input), Enter opens "Relier
     à…" (unchanged). Enter on a tag socket no longer opens it: a tag is
     never linked.
   Tag sockets and power ports are distinct sockets, so no key has two
   meanings on one socket. What happens when the PLC writes a tag that is
   forced is ADR 0031.
4. **The "Édition" menu acts on the selection**, whatever set it.
   "Supprimer" (Suppr) deletes the selected element, a device included; a
   refusal of the API (a drive that feeds an actuator, ADR 0028 point 10) is
   a notification of the viewer, not a console line (ADR 0031): the user's
   action failed, not the core. It names the actuators to detach first, as
   links that select them. "Renommer" (F2) focuses the name field of the
   inspector, as there is no tree row to rename in place for a device; it
   works from a node focused in the diagram as well. The keyboard focus
   comes before the selection: a component that handles a key has the last
   word (`shortcuts.ts`, unchanged). In the diagram, Delete keeps its rule:
   it removes the focused link, or shows a hint, and never removes an
   element, even the selected one. Deleting a device is done from the
   menu, or with Suppr outside the diagram.
5. **Labels on sockets, not on edges.** A drive to actuator edge carries no
   text: each end socket names its port, which is enough to read a feed
   (amends ADR 0029 point 5). Every socket label comes from the type's
   `labels.ts` (ADR 0010), never a raw key: drive types gain port labels
   ("Orifice 2", "Orifice 4", "Sortie"), next to their tag labels ("Bobine
   14") and to the actuator port labels ("Chambre fond") and sensor state
   label ("État") that exist.
6. **Distinct default names, at creation only.** When a drive and an
   actuator are created together (a future "drive and actuator" form), the
   drive's default name takes a suffix by family: `-dist` for valves, `-km`
   for contactors, `-var` for variable speed drives, `-drv` for servo
   drives. Existing names are never changed: no migration, no renaming on
   load. A user may want two elements to share a name, and point 2 tells
   them apart by type.
7. **3D above, diagram below.** The central area has three layouts, chosen
   by the toolbar switch, now "3D / Schéma / 3D + Schéma", and by keyboard
   shortcuts: the 3D view alone, the diagram alone, or both, the 3D view
   above and the diagram below, split by a horizontal splitter that the
   mouse drags and the arrow keys move when it has the focus. Both is the
   default layout. The splitter starts at 60 % for the 3D view; double
   clicking it restores that. The layout and the splitter position are a
   setting of the viewer, kept in the browser, never in the Pantin. Both
   halves keep their own scroll and zoom.
8. **Render loop.** The Babylon.js render loop runs whenever the 3D view is
   shown, alone or above the diagram, and resizes its canvas on every
   splitter move; it stops only in the diagram layout (ADR 0029 point 10,
   unchanged for that case).
9. **The inspector in every layout.** It is the same right-hand panel in the
   three layouts; the switch changes the central area only.

## Rejected alternatives

- Two panels split by role, the document on the left and the devices on
  the right: a rule the user has to learn, and a left-hand panel with
  nothing to show when a device is selected.
- Keeping the last tree node in the left-hand panel when a device is
  selected: the panel would show what is not selected, and an edit would
  hit the wrong element.
- Sections and forms for every element in the inspector: the grid already
  edits in place and keeps its groups folded across selections.
- Hiding the panel in the diagram view: faults, parameters and forms would
  have no place left there.
- Rows for devices in the tree, to keep a selection by tree node: the tree
  would repeat the diagram, the redundancy this ADR removes.
- Delete on a focused diagram node deleting that element: Delete in the
  diagram would no longer be harmless, and a key pressed to remove a link
  could remove a drive.
- Renaming colliding names, by migration or on load: names are not unique
  in the schema, a user may want them equal, and a schema version for a
  display issue is out of proportion.
- Forms inside the diagram nodes: nodes grow with their parameters and the
  columns stop lining up.
- Forcing by double click or by selecting first: slower for the gesture
  repeated most while testing a PLC program.
- The diagram beside the 3D view, left and right: the diagram is wide (four
  columns) and the 3D view needs width too; stacked, each gets the full
  width.
- The diagram floating over the 3D view: it hides the bodies it describes.

## Consequences

- The selection model of the viewer changes (`viewer-state.ts`,
  `diagram-selection.ts`, the tree's highlight of related rows, the menu's
  enabled entries); with the move of `properties-model.ts` into the
  inspector, this is the largest part of the work.
- The drive, actuator and sensor sections become grid groups; their
  "Alimenté par", "Liaisons" and "Surveille" sections go, as do the
  "Actionneur" and "Capteurs" groups of a joint.
- With one side panel, the central area gains width, which the four-column
  diagram needs in the split layout.
- Every drive type gains port labels in `labels.ts`, in English and French.
- The viewer tests cover: selection from each source and each kind, the
  move to the Pantin when the selected element disappears, related rows in
  the tree, the inspector for each kind, the index for the Pantin and an
  assembly, forcing a socket without changing the selection, the keys of
  point 3, Delete and F2 on a selected device, a refused delete, Delete in
  the diagram leaving the selected element in place.
- In the default layout, tag values and port states are read every 250 ms
  (ADR 0029 point 8) for as long as a Pantin is open.
- The backlog entry "split view" of ADR 0029 is done by point 7.
- To verify: frame rate with both halves live (Babylon.js, and SVG updated
  every 250 ms) on a generated Pantin of 50 assemblies; at 1080p, a 40 %
  diagram holds about two expanded bands, so collapsing bands matters
  more.
