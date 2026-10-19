# 0059. The joint star view

- Status: accepted (user, 2026-10-19); the line styles and glyphs of point 5
  are starting values, to be validated on a screenshot.
- Date: 2026-10-19
- Extends: ADR 0029 (chain diagram), ADR 0030 point 7 and ADR 0049 point 11
  (central layouts), ADR 0055 (groups), ADR 0057 (colour-blind safe coding)

## Context

The user asked (2026-10-19) for "de quoi faire une vue en étoile des
liaisons, type carte mentale ou rendu graphify", and chose: a new central
view "Liaisons" / "Joints" next to 3D and Schéma, combinable with the 3D
view as "3D + Schéma" is; nodes are the groups and the bodies that carry a
joint; bodies without a parent joint that follow their group are counted in
the group's node and can be unfolded.

Facts checked in the repository on 2026-10-19:

- The kinematic structure is a forest: each body and each group has at most
  one parent joint, with no cycle (ADR 0055 point 4). Joint endpoints are
  `{ kind: "body", id } | { kind: "assembly", key }`.
- `computeDisplacements` (`packages/core/src/domain/kinematics.ts`): a link
  with a parent joint moves with its parent; a body without one follows its
  own assembly (`body.assembly`) as a group; a group without a parent joint
  has the identity. A sub-assembly that has no joint of its own therefore
  does not move with the group above it. The structure tree carries no
  motion (ADR 0055 point 5).
- No screen shows this kinematic tree. The tree shows the structure tree
  and lists joints under their bodies and groups (`tree/node-ids.ts`). The
  chain diagram shows drive → actuator → joint → sensor and leaves fixed
  joints out (ADR 0029 point 2).
- Joint types: `fixed`, `prismatic`, `revolute`, `continuous`, `helical`
  (`packages/protocol/src/joint-types/`).
- The viewer already holds the whole `PantinDocument`: joints, bodies,
  assemblies, actuators (for example `diagram/diagram-forest.ts`,
  `actuatorOfJoint` in `actuators/actuator-joints.ts`). The endpoint helpers
  (`endpointKey`, `endpointAssemblyIn`) are in `@pantin/protocol`.
- Central layouts: `"3d" | "diagram" | "both" | "io"` (`central-layout.ts`,
  pure). The value is kept in the browser and an unknown stored value falls
  back to the default. F4 cycles both → 3d → diagram. `central-area.ts`
  holds one horizontal splitter used in "both".
- The diagram is SVG built from pure modules (`diagram/`) and drawn by
  `ui/diagram-view.ts`, with keyboard focus moved by `RovingFocus`. It has
  no zoom. Selection goes through `PanelIntents` (`selectNode`, `frameNode`,
  `selectDiagramNode`) using the tree node ids `assembly:<pantin>:<key>`,
  `body:<pantin>:<id>`, `joint:<pantin>:<id>`. The tree's double click
  starts a rename.
- Icons (`ui/icons.ts`) have one generic `joint` icon and a `bolt` ("a drive
  moves this joint"). There is no glyph per joint type.
- `Translateur SCIE.step` imports as 51 bodies, 10 assemblies and 9 fixed
  joints, all between groups (ADR 0055, amendment of slice 3). Pantins made
  before ADR 0055 keep their internal fixed joints, up to 20 on one bearing
  (backlog `remove-redundant-fixed-joints.md`).

NOT VERIFIED:

- that selecting a group row outlines all of its bodies in the 3D view;
- that 12 px glyphs drawn on an SVG line can be told apart;
- that the label layout holds on the user's real Pantins without overlaps;
- that the toolbar fits on a narrow window with two more layout buttons.

## Decision

1. **A view, not a model.** As for the diagram (ADR 0029 point 1), the view
   is computed from the document the viewer already reads. There is no new
   core route, no protocol change and no file in the Pantin. The view only
   displays: it computes no pose and no simulation.

2. **What is shown.**
   - A *link node* for each group (an assembly that is a joint endpoint) and
     for each body that is a joint endpoint, as parent or as child.
   - A *joint edge* for each joint, from its parent to its child, fixed
     joints included.
   - A *follows edge* (no joint) from a group to a body node of that group
     that has no parent joint, for example a rod body that carries a gripper.
   - A *World* node at the centre (user, 2026-10-19), even with several roots. Every link without
     a parent edge hangs from it by an *anchor edge*: those links do not
     move.
   - **Following bodies.** A body that is neither a joint endpoint nor
     jointed is counted in the node of its own assembly when that assembly is
     a group, otherwise in World, because it never moves. The node shows the
     count ("12 corps"); unfolding it shows each body as a leaf on a follows
     edge.
   - **Driven joints.** A joint moved by an actuator carries the `bolt` glyph
     next to its type glyph, in a neutral colour.
   - This makes visible redundant fixed joints (one body hub with 20 fixed
     edges) and bodies that sit at the root although the user expected them
     to follow a group.

3. **Forest rule** (pure, `packages/viewer/src/joint-star/joint-star-forest.ts`).
   - Parent of a link L: the parent endpoint of L's parent joint; otherwise,
     for a body, its assembly's group node if that node exists; otherwise
     World.
   - Children are ordered joint edges first, then follows edges, then by id
     in code point order, as in `diagram-forest.ts`, so the result is the
     same in every browser.
   - Fold state belongs to the viewer and is never saved. By default every
     node's following bodies are folded and every joint subtree is unfolded.

4. **Radial layout** (pure, `joint-star-layout.ts`).
   - World sits at the centre; a node at depth d sits on ring d.
   - Each subtree gets an angular sector proportional to its number of
     visible leaves (a folded node counts as one). A node sits on the
     bisector of its sector; the first child starts at 12 o'clock and the
     others follow clockwise.
   - The radius of ring d is `max(d × ringStep, n_d × pitch / 2π)`, n_d being
     the number of node slots on that ring: a crowded ring grows outward and
     no two nodes are closer than `pitch`. Radii never decrease outward.
   - Labels are horizontal, on the outer side of their node: right-aligned
     on the left half, left-aligned on the right half. Long names end with an
     ellipsis; the selected node shows its full name.
   - Expected scale: `Translateur SCIE` gives 11 nodes folded (World, 10
     groups) and about 60 fully unfolded, a ring of about 10 pitches in
     radius, which the zoom covers.
   - No free placement and no stored positions (ADR 0029, rejected
     alternatives).

5. **Coding per joint type (ADR 0057).**
   - Every edge has three cues: a line style, a 12 px glyph at its middle and
     the joint name next to the glyph. Colour is never a cue: edges and
     glyphs use the neutral text colours at 3:1 or more against the ground
     (WCAG 1.4.11, tested).
   - Selection blue marks the selected node or edge and its path to World.
     Neither the brand orange nor any state colour is used.
   - Starting values, to be checked on a screenshot with the user:

   | Edge | Line | Glyph |
   | --- | --- | --- |
   | fixed | 1 px solid | filled square (weld) |
   | prismatic | 2 px long dashes | rectangle with a two-headed arrow |
   | revolute | 2 px solid | arc with two end stops |
   | continuous | 2 px dotted, round caps | full circle with an arrow |
   | helical | 2 px dash-dot | three slanted strokes (thread) |
   | follows | 1 px fine dots | none, no label |
   | anchor | 1 px solid, faint | ground hatch at World |

   - Node shapes: World is a circle with the ground hatch; a group is a
     rounded rectangle with its count and a fold chevron; a body is a pill.
   - A legend in a corner lists the edges, the shapes and the driven mark; it
     can be closed, and that state is kept in the browser.
   - Glyph paths go in `ui/icons.ts`; texts go to the translation files
     (ADR 0010), reusing `joint.type.*`.

6. **Interactions.**
   - **Click** on a node selects its tree row (`selectNode` with the assembly
     or body node id); click on an edge selects the joint. The tree, the 3D
     view, the diagram and the inspector follow, as for any selection.
   - **Selection made elsewhere** is highlighted here: the selected rows and,
     for a drive or an actuator, the joints it moves. No Ctrl+click: the
     multi-selection stays in the tree (ADR 0055 point 12).
   - **Double click** frames the node, or the joint's child, in the 3D view
     (`frameNode`) when the 3D view is shown. In the joints-only layout it
     only selects (user, 2026-10-19): the layout never changes on its own.
   - **Right click** opens the tree's context menu for that node or joint,
     with the same entries (user, 2026-10-19).
   - **Fold and unfold** through the chevron, or "+" and "−" on the focused
     node.
   - **Wheel** zooms around the pointer; dragging the empty ground pans;
     "Ajuster" fits the whole star. Zoom and pan are a pure transform
     (`joint-star-viewport.ts`), kept in memory, never saved.
   - **Keyboard**, usable without a pointer like the diagram (ADR 0029
     point 7), through `RovingFocus`: Left goes to the parent, Right to the
     first child, Up and Down to the previous and next sibling; Enter frames,
     Space selects.

7. **Place in the central area.**
   - `CentralLayout` gains `"joints"` (the view alone) and `"3d-joints"` (3D
     above, joints below). The toolbar and View menu gain "Liaisons" and
     "3D + Liaisons".
   - The split reuses the existing splitter and its stored ratio.
   - The render loop rule of ADR 0030 point 8 stays: it runs whenever the 3D
     view is shown; `showsViewport` and `shouldRender` cover the new values.
     Without a Pantin open, the 3D view takes the area as today. Old stored
     values still parse.
   - F4 keeps its cycle (both → 3d → diagram); the joint layouts are chosen
     from the toolbar or the View menu (user, 2026-10-19).

8. **No editing in this view.** Editing joints stays in the tree, the
   inspector and the joint form: the editing rules of ADR 0055 (refusals,
   renamed tags) need the form and its messages; a reparenting gesture would
   be a new command with its own ADR; a read-only first version keeps the
   view free of mistaken edits while zooming and panning. What the view
   offers are the existing commands on the selection: Delete and F2, and the
   tree's context menu on right click (point 6), with their usual forms and
   messages.

9. **Files.** Pure modules in `packages/viewer/src/joint-star/` (forest,
   layout, styles, viewport transform), each under 300 lines with tests next
   to them. Drawing in `ui/joint-star-view.ts`, SVG through `svg-dom.ts`,
   following the diagram's pattern (draw on layout change, apply selection
   in place). No dependency is added.

## Rejected alternatives

- **A graph library** (cytoscape.js, d3-hierarchy or d3-force, ELK, dagre):
  a new dependency (CLAUDE.md section 8) for a forest that a few dozen lines
  of pure code lay out, as ADR 0029 found for the diagram.
- **A force-directed layout:** not deterministic; the star would move at
  every redraw and edit, and tests could not fix positions.
- **Adding joints to the chain diagram:** that diagram is organised by
  action chain and assembly band, without fixed joints; adding the
  kinematic tree would mix two structures and double the joint nodes.
- **The kinematic tree in the left tree:** that tree is the structure tree
  (ADR 0040, 0047). The two structures differ, which is the point of this
  view.
- **A top-down tidy tree:** easier to read for deep chains, but the user
  asked for a star. It could later be an option of the same pure forest.
- **Drawing in the Babylon.js canvas:** text and accessibility are poorer
  than SVG (ADR 0029).
- **One colour per joint type:** five data colours ΔE 40 apart for three
  colour deficiencies did not fit even for the diagram's wires (ADR 0057,
  slice 7 amendment). Line style, glyph and name are enough on their own.

## Consequences

- The kinematic structure reads at a glance. Redundant fixed joints and
  bodies that do not follow the expected group become visible, which
  prepares the backlog item `remove-redundant-fixed-joints.md`.
- No change in core, protocol, bridge or the schemas. `CentralLayout` gains
  two values; the toolbar and menus grow.
- New tests: forest and layout (empty Pantin, one root, several roots, the
  `Translateur SCIE` shape, a pre-0055 hub of 20 fixed joints, an unjointed
  sub-assembly inside a moving group placed at the root, folding,
  determinism, minimum spacing); viewport transform; layout cycle; neutral
  glyph contrast and the CSS allowlist of ADR 0057.
- The guide and its screenshots gain a page (doc-writer, French and
  English).
- Left to the backlog: live joint position or an injected "grippé" fault on
  the edges (a state: red with its glyph, ADR 0057); a sensor mark on watched
  joints; editing from the view.

## Slices (viewer only, each with tests and `pnpm check` green)

1. Pure modules: forest, radial layout and edge styles, with their tests.
2. View: `"joints"` and `"3d-joints"` layouts, SVG drawing, glyphs and
   legend, selection both ways, keyboard, i18n, contrast tests.
3. Fold and unfold, wheel zoom and pan, "Ajuster", double click to frame.
4. doc-writer (guide in French and English, screenshots, CHANGELOG), then
   the reviewer.

## Answers of the user (2026-10-19)

1. Several roots: one "Monde" / "World" node at the centre.
2. F4 unchanged.
3. Double click in the joints-only layout: select only.
4. Right click: the tree's context menu.
5. Still open: the line styles and glyphs of point 5, to be validated on a
   screenshot after slice 2.

## Amendment (2026-10-19): a horizontal tree instead of the star, found in slice 2

The slice 2 screenshots on the user's machine-V2 showed the star squeezed
into the central area: labels and glyphs became unreadable, and the deep
chain (World, Translateur SCIE, Chariot SCIE, Chariot Scie plaque, then its
bearings) was flattened on rings. The user then chose, with a reference
picture of a left-to-right tree with curved links:

- Point 4 is replaced. The layout is a horizontal tree: World on the left,
  one column per depth, children stacked top to bottom in the order of
  point 3, a parent centred on its children, no two nodes closer than the
  row pitch. Edges are curves from the right of the parent to the left of
  the child. It stays pure, deterministic and tested, without a dependency.
  The star layout is removed (user: replace, not offer both).
- Labels sit to the right of their node, horizontal and in full; a column is
  as wide as its longest label up to a cap, beyond which the name ends with
  an ellipsis and the full name is in the accessible name and the tooltip.
- Texts and glyphs keep their screen size while zooming; only distances
  scale. A large machine grows downward and the view scrolls or pans.
- The legend is a single line that unfolds on demand, closed by default.
- Unchanged: the forest of points 2 and 3, the World node, the coding of
  point 5, the interactions of point 6 and the answers of the user.
- The view keeps the name "Liaisons" / "Joints". The file and module names
  that say "star" are kept to avoid churn.
- The reference picture colours its nodes with close hues and draws
  cross-links in red; neither is taken (ADR 0057). Cross-links such as
  "this actuator moves these joints" go to the backlog note
  `joint-star-extras.md`, with their own line style.

## Amendment (2026-10-19): names in the shapes, found while trying the tree

After trying the horizontal tree on machine-V2 the user asked for the names
inside the shapes, and reported a dashed line cut short. Each group and
body shape is now sized to its own label (16 characters, then an ellipsis;
the selected shape grows to the full name), with the fold chevron and the
count inside the group shape; World keeps its circle with the name under
it. Every edge starts at the right edge of its own parent shape and ends at
the left edge of its child, which fixes the cut line (edges started after
the longest label of the column). Joint names, cut at 10 characters, sit
next to the end of their curve, near their child.

## Amendment (2026-10-19): one view selector per zone, found while trying the tree

Point 7 is replaced, and with it ADR 0030 point 7 and ADR 0049 point 11
(first bullet), which get an amendment pointing here. The user asked for a
view selector per zone instead of combined layouts:

- The central area has a top zone and an optional bottom zone, split by
  the existing splitter and its stored ratio. Each zone has its own
  selector in its top left corner: 3D, Schéma, Liaisons, E/S. A button
  opens the bottom zone, another closes it. The combined switch of the
  side panel ("3D + Schéma", "3D + Liaisons") is removed.
- A view shows in one zone at most: in the other zone's selector its button
  is disabled, with the reason in its tooltip and accessible name (user's
  choice over swapping). There is one 3D scene and one render loop; the
  rule of ADR 0030 point 8 holds: the loop runs whenever the 3D view shows
  in a zone.
- F4 moves the top zone to the next view, 3D → Schéma → Liaisons → E/S,
  skipping the view shown in the bottom zone (user's choice).
- The View menu offers the top zone's views, the bottom zone's views and
  open or close the bottom zone.
- The layout is still a viewer setting kept in the browser, never in the
  Pantin. The old stored values ("3d", "diagram", "both", "io", "joints",
  "3d-joints") are read into the new form, so no one loses their setting.
- The brand-orange mark of the active view stays (ADR 0053), alone in its
  row, as ADR 0057 rule 5 requires.

## Amendment (2026-10-19): keyboard route to a joint and the path cue, found in review

- Point 6, keyboard: joint edges are not tab stops. The J key on a focused
  node selects the joint that hangs it from its parent; it is the keyboard
  route to a joint. Edges keep an accessible name but no button role.
- Point 5, selection: the path from the selection to World is drawn thicker
  than resting edges, each keeping its dash pattern, and everything off the
  path is dimmed; the selection blue is never the only cue.
