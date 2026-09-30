# 0029. A chain diagram view, in columns

- Status: accepted
- Date: 2026-09-30
- Depends on: ADR 0028 (drives and actuators)
- Amends: ADR 0024 (point 5: when tag values are read)
- Extends: ADR 0010 (translations)

## Context

With ADR 0028 a machine is a chain per device: drive, actuator, joints,
sensors. The tree and the right-hand panel list these elements apart; the
user cannot see which valve feeds which cylinder, nor which switch watches
it. The user asked on 2026-09-30 for a node view in the spirit of n8n, to
make the assembly readable, more engaging, and able to grow.

A free placement, as in n8n, needs stored node positions and becomes
unreadable at the target size (5 to 10+ devices today, far more later, at
about five nodes each). The user chose on 2026-09-30 a layout in columns,
computed, with nothing stored.

Facts that follow from ADR 0028 point 9 and ADR 0023 point 3: an actuator
is fed by one drive at most, a joint is moved by one actuator at most, a
sensor watches one joint. The chains therefore form a forest: every node
has at most one parent in the column to its left. A drive, an actuator and
the joints it moves may belong to different assemblies (joints between
assemblies exist, ADR 0019).

## Decision

1. **A view, not a model.** The diagram is computed from the Pantin
   document the viewer already reads. It adds nothing to `pantin.json` and
   no file to the Pantin folder. Every edit is an existing REST call; the
   core stays the only judge of what is valid.
2. **Columns by role**, left to right: drives, actuators, joints, sensors.
   A drive node shows its command tags as named inputs on its left edge and
   its output ports on its right; an actuator node shows its input ports on
   its left; a sensor node shows its tag on its right. Tags have no column
   of their own, which would double the node count. Fixed joints are left
   out: nothing drives or watches them.
3. **Rows by assembly.** Each assembly is a horizontal band, in document
   order, with a header that collapses it to one line. A chain lives in the
   band of its root: the drive, or the first node without a parent (an
   actuator without feed, a joint without actuator). A node of another
   assembly is drawn in that chain with a badge naming its assembly, and
   listed only there. Inside a band, each leaf of the forest gets a row and
   a parent is centred on its children, ordered by id, so that the layout is
   deterministic and edges of different nodes never cross. Edges leaving one
   node may cross each other: a valve feeding two cylinders sends `port_4`
   to both caps and `port_2` to both rods, which no order of sockets draws
   without a crossing. A fed actuator's input sockets follow the order of the
   drive ports its default feed reads (ADR 0028 point 2), so that a default
   feed draws straight and a swapped one crosses. An edge between two
   heights leaves and enters horizontally and crosses the gap on a slant, so
   that edges from two sockets never share a segment and a crossing always
   shows as an X (right-angled wires cannot avoid an overlap on a swapped
   feed). Edges from one socket share their first stub, as a fan-out
   (amended on 2026-09-30, while laying out). An actuator without feed shows
   empty input ports.
4. **Layout in the viewer.** A pure display module turns the document into
   node boxes and edge paths, unit tested like the rest of the display
   logic. The view renders them as SVG. No dependency is added.
5. **Edges tell their domain.** Drive to actuator edges take the port's
   domain (`pneumatic`, `ac_power`, `servo`) and name the ports they join
   (`port_4` → `cap`); actuator to joint edges are mechanical; joint to
   sensor edges are observation. Each kind has a colour token and a line
   style, so that colour is never the only cue.
6. **Editing by wiring**, with the links of ADR 0028 point 9:
   - dragging from a drive output port shows the actuator input ports of the
     same domain and dims the others; dropping sends the actuator update.
     On an actuator with no feed, the other input ports get the default
     feed of ADR 0028 point 2 from the same drive; on a fed actuator, the
     new port replaces the old one, and a port of another drive replaces
     the whole feed after a confirmation;
   - an actuator's feed and its joints can be removed (the document allows
     both to be empty);
   - a sensor always watches one joint: its edge can be moved to another
     joint, never removed;
   - a "+" at the head of each column opens the existing creation form.
   Domains and ports come from the drive and actuator type schemas, which
   the viewer already imports (ADR 0022 point 2).
7. **Keyboard.** Nodes and ports take the focus in reading order (band,
   then row, then column); arrow keys move between neighbours. On a focused
   port, "Relier à…" lists the compatible ports or joints and links the
   chosen one; Delete removes the focused edge where point 6 allows it. The
   diagram is fully usable without a pointer, like the tree.
8. **Live state.** A command or feedback bit at 1 lights its socket; a
   drive output port lights its edge when it is not at rest (under
   pressure, a direction other than 0). A drive with a diagnostic (ADR 0028
   point 5) is outlined and names it. Values come from the core; the
   viewer never computes a state. The core exposes drive port states next
   to tag values, with its diagnostics: runtime state, read only, never
   saved, described by a Zod schema in the protocol. Tag values and port states are read every
   250 ms while the right-hand panel is open, while the Pantin has a
   sensor (ADR 0024 point 5), or while the diagram is shown.
9. **Selection shared with the 3D view.** Selecting a node selects its
   element in the tree and highlights the bodies moved downstream of it (a
   drive highlights every body its actuators move). Selecting a body in the
   3D view highlights its chain in the diagram.
10. **Place in the viewer.** The diagram replaces the 3D view in the central
    area, through a "3D / Schéma" switch in the toolbar and a keyboard
    shortcut. While the diagram is shown, the Babylon.js render loop is
    stopped; it restarts, with the latest body poses, when the 3D view comes
    back. A side by side split is left to the backlog. Texts go to the
    translation files (ADR 0010).

## Rejected alternatives

- Free placement with a layout file, as in n8n: more freedom, but positions
  to store, merge in git and keep in step with the document, and a tangle
  beyond a few dozen nodes.
- A node editor library (Rete.js, LiteGraph, Drawflow): their value is free
  placement and graph execution, neither needed here. Their current
  versions, licences and use without a UI framework are NOT VERIFIED; a
  spike is due if free placement comes back.
- An automatic graph layout library (dagre, ELK): a forest in fixed columns
  is laid out by a few lines of pure code.
- Drawing the diagram inside the Babylon.js canvas: poorer text rendering
  and accessibility than SVG in the page.
- A column of tags: twice the nodes for information the drive node carries.
- Duplicating a node in every band it touches: the same element shown twice
  would look like two elements.
- Refusing to remove an actuator's feed: an actuator could not be moved from
  one valve to another without deleting it.

## Consequences

- The chain of every device reads at a glance, and a PLC program can be
  followed live from coil to switch.
- The protocol gains a schema for drive port states and the core a read
  route, or a field in the tag read, for them; it must stay cheap at
  250 ms.
- The layout test covers: fan out of one valve to two cylinders, an
  actuator moving two joints, a chain across two assemblies, orphan joints
  and actuators, collapsed bands.
- To verify: SVG performance with 50 assemblies and live state, measured on
  a generated Pantin; legibility of revolute and continuous joints as nodes;
  the render loop restart without a visible jump.
- Backlog: split view, a filter by name or tag, a print or PDF export of the
  diagram as machine documentation.
