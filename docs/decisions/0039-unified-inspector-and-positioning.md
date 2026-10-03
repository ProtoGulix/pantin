# 0039. One inspector for properties and positioning

- Status: accepted
- Date: 2026-10-03
- Amends: ADR 0030 (point 2: what the inspector shows for an assembly,
  a body and a joint; its width and open state), ADR 0034 (points 1, 3,
  5, 6 and 7: where the fields, toggles and steps live, the scope of
  G and R, and Escape), ADR 0035 (points 3, 6 and 8: the alignment
  "dialog" becomes a section of the inspector)
- Depends on: ADR 0033 (assembly placement), ADR 0036 (keys ignored
  while typing)

## Context

On 2026-10-03 the user asked, in French: "le pannel de positionnement
et le pannel de gauche "inspecteur" doivent être unifiés. refonds
complètement pour que le fonctionnement soit le plus fluide." In English:
the positioning panel and the "inspector" panel must be unified,
redesigned so that working with them is as fluid as possible. A
screenshot from the user shows the floating "Aligner « chape_nd032a »"
box over the top left of the 3D view, and the inspector in the right
column with the "Placement" group.

Today, placing an assembly uses four places on screen:

- The inspector (right-hand column, 340 px fixed): the "Placement"
  group with the anchor and X, Y, Z, RX, RY, RZ (ADR 0034 point 1).
- The toolbar at the top of the left column: "Déplacer" (G),
  "Tourner" (R) and "Aligner" (A). The gizmo's step field appears there
  only while the gizmo is on.
- The alignment panel: a `role="dialog"` box that floats over the top
  left corner of the 3D view (ADR 0035). It has the kind, the picks,
  flip, offset, rotation, the fixed joint option, "Recommencer" and
  "Aligner".
- The message line at the bottom of the left column, where a typed
  value that is not a number is reported.

Facts checked in `packages/viewer` on 2026-10-03 give these frictions:

1. The placement fields and the tools that change the same placement
   sit at opposite edges of the window: fields on the right, G/R/A and
   steps on the left, the alignment box over the 3D view
   (`styles/alignment-panel.css`, `ui/gizmo-controls.ts`).
2. An alignment session is bound to an assembly, not to the selection.
   Selecting something else in the tree keeps the session alive (clicks
   in 3D are still picks), while the inspector shows the other element
   (`controller/alignment-actions.ts`, `scene/viewport.ts`).
3. Nothing but the box's close button, or A again, ends an alignment.
   Escape does nothing outside a gizmo drag
   (`scene/placement-gizmo.ts`). The offset and rotation fields do not
   follow the inspector's rule (commit on Enter or blur, Escape
   restores): they are plain inputs that commit on "change".
4. A wrong pick can only be fixed by "Recommencer", which drops every
   pick. Once all faces are picked, a further click is refused
   (`alignment/pick-resolution.ts`).
5. The "simulation en marche" hint is always shown in the alignment
   box, even when the clock is paused.
6. During a gizmo drag the placement fields keep the old values. The
   document is read again only when the drag ends
   (`controller/placement-actions.ts`).
7. A typed placement that is not a number is reported in the message
   line, far from the field.
8. A click on empty space in the 3D view clears the selection
   (`controller/controller.ts`). If the user misses the gizmo, the
   gizmo disappears and the inspector empties.
9. G, R and A work only when an assembly is selected
   (`gizmo/gizmo-spec.ts`). With a body selected they are greyed out,
   with no hint that the assembly is the target.
10. A joint shows two groups both titled "Position": its origin and
    axis, and its live position (`fr.json`).
11. The inspector cannot be resized, and its open state and folded
    groups are forgotten when the page reloads
    (`styles/inspector.css`, `viewer-state.ts`, `ui/browser-storage.ts`).
12. In the diagram layout the alignment box is hidden with the 3D view,
    but the session stays active.

The viewer has no undo. An edit is undone by discarding the unsaved
changes (ADR 0034 Context). The selection is one value: there is no
multi-selection (`selection.ts`).

## Decision

1. **One panel, the inspector.** The inspector stays the right-hand
   column of ADR 0030 and becomes the only place where the selection is
   read, edited and positioned. The floating alignment panel goes. The
   left column keeps the toolbar, the tree, the prompt line and the
   message line. The inspector's structure, top to bottom:
   - the head: subject (kind and name), and a collapse button;
   - the "New drive / actuator / sensor" buttons (unchanged, ADR 0030);
   - the form being filled, if any (unchanged);
   - the "Positionnement" section, when the selection can be placed
     (point 2);
   - the property grid groups of ADR 0030, each foldable, whose folded
     state survives a change of selection and, from now on, a reload
     (point 8).

2. **What shows, by selection.**
   - **Assembly**: "Positionnement" first, then its properties and its
     index of devices (ADR 0030). "Positionnement" contains:
     - the anchor row ("Repère : monde" or the anchor's name) and the
       six fields X, Y, Z (mm), RX, RY, RZ (°) of ADR 0034 point 1;
     - a tool row of three toggle buttons, at most one pressed:
       "Déplacer (G)", "Tourner (R)", "Aligner (A)";
     - the step field of the pressed gizmo tool (mm for Déplacer, ° for
       Tourner), moved here from the toolbar, still kept in the browser
       (ADR 0034 point 5);
     - while "Aligner" is pressed, the alignment block (point 4) below
       the tool row.
   - **Body**: its properties, with its placement read only when it has
     one (ADR 0034 point 6). "Positionnement" shows the line "Se place
     avec l'assemblage « {name} »" and the same three tool buttons. A
     tool started from a body moves the selection to its assembly first
     (point 6).
   - **Joint**: unchanged, except the titles. Its origin and axis group
     becomes "Repère de la liaison", and "Position" stays for the live
     position and the slider.
   - **Drive, actuator, sensor**: unchanged (ADR 0030 point 2).
   - **Pantin, folder, nothing**: unchanged, with no "Positionnement".
   - **Multi-selection**: none exists, and this ADR adds none.

3. **One tool at a time, tied to the selection.** The viewer state
   keeps `gizmoMode` and `alignment` as today. One rule governs them:
   - a tool belongs to the selected assembly. Selecting another assembly
     keeps a gizmo tool on, on the new assembly (as today). It restarts
     an alignment on the new assembly with no picks. Selecting anything
     that is not an assembly or a body turns the tool off;
   - while a tool is on, a click on empty space in the 3D view does not
     clear the selection (friction 8). A click on a body still selects
     its assembly when the gizmo is on, and is a pick while aligning
     (ADR 0035 point 3, unchanged);
   - in the diagram layout, where the 3D view is hidden, the tools are
     off and their buttons disabled.

4. **Alignment, inline.** The alignment block holds what the floating
   panel held, in the same order (ADR 0035 points 5 and 8): the kind,
   one row per pick, the parameters the kind has, "Créer ensuite une
   liaison fixe", "Recommencer" and "Aligner". Changes:
   - a pick row that is done is a button. Clicking it makes that pick
     the current one again, and the next click in 3D replaces it. The
     other picks are kept (friction 4);
   - picks keep their tint in the 3D view, and the row of the current
     pick is marked "cliquez dans la vue 3D", as today;
   - the "simulation en marche" note shows only while the clock runs;
   - offset and rotation are committing fields, like every field of the
     panel (point 5);
   - Enter on "Aligner", or on a parameter field when every pick is
     made, applies. After success the placement fields above show the
     new values (the document is read again, as today), and the picks
     start over with the kind and parameters kept, so a "plan sur plan"
     can be followed by an "axe sur axe" without leaving the block.

   The alignment stays an explicit action, not an apply on every
   change. It takes two or three picks, and the core computes it from
   the configuration on screen (ADR 0035 point 6). After it, the
   moving picks no longer describe where the faces are, so changing a
   parameter cannot be applied again from the same picks.

5. **Edit model: commit on Enter or blur, everywhere.**
   - Every typed field of the inspector, placement fields and alignment
     parameters included, uses `committingTextInput`. Enter or leaving
     the field commits, only if the value changed. Escape restores the
     value and leaves the field. Enter in a placement field moves the
     focus to the next one (X, Y, Z, RX, RY, RZ).
   - A placement field commits straight to the core
     (`PUT .../placement`, ADR 0034 point 1). An alignment parameter
     commits to the viewer's session only, and "Aligner" sends it.
     Those are the only two behaviours, and the difference is visible:
     only the alignment block has an apply button.
   - Invalid text (not a number) keeps the text typed, marks the field
     (`aria-invalid` and the danger style), and says why on one line
     under the group. The message line is no longer used for it
     (friction 7). The value in the document does not change.
   - During a gizmo drag the six fields show the last placement sent to
     the core, in display units, marked as being dragged. This is the
     value of the viewer's own request, not a computed pose (CLAUDE.md
     section 3.2). On release, the document read again replaces it
     (friction 6).
   - The unsaved dot of "Enregistrer" is unchanged. Every placement and
     alignment is an edit of the Pantin, undone by discarding, as
     today.

6. **Keys and focus.**
   - G, R, A: toggle the tool, as today. They now also work with a body
     selected: the selection moves to the body's assembly first. They
     open the inspector if it is collapsed and unfold "Positionnement".
     The keyboard focus stays where it was, so the next mouse click in
     3D is a pick or a drag, and a further G/R/A is not typed into a
     field. Still ignored while typing in a field (ADR 0036 point 7).
   - Escape, in this order of priority, each handler stopping the key:
     ends a gizmo drag and restores the start placement (ADR 0034
     point 7, unchanged); leaves a text field, restoring it; closes a
     menu, a prompt or the diagram's link menu (unchanged); otherwise
     turns the positioning tool off. The last case is a plain-key
     handler in the bubble phase that gives way when another component
     handled the key (`event.defaultPrevented`, `shortcuts.ts`). The
     diagram calls `preventDefault` on the keys it handles
     (`diagram-keys.ts`), so its Escape steps back without ending the
     tool.
   - F2: focuses the name field in the inspector (unchanged). Delete:
     unchanged (ADR 0030 point 4, ADR 0037).
   - No new key is added, in line with ADR 0036.

7. **The toolbar loses the positioning tools.** "Déplacer", "Tourner",
   "Aligner" and the step field leave the toolbar (`gizmo-controls.ts`
   goes). They stay in the "Édition" menu with their keys, and in the
   inspector, where the fields they change are.

8. **Layout and persistence (browser storage, per viewer, never in the
   Pantin).**
   - The inspector gets a splitter on its left edge, like the left
     column (`createSplitter`). Default width 340 px, minimum 260 px.
     Double click resets it. Arrow keys move it when it has the focus.
   - One pure function clamps both columns so that the 3D view keeps
     its minimum width (320 px, `layout-sizes.ts`). It narrows the
     inspector first, then the left column. Below about 800 px of
     window width the layout is not supported (NOT VERIFIED threshold;
     touch and tablet are out of scope).
   - New keys in `STORAGE_KEYS`: `inspectorWidth`, `inspectorOpen` and
     `collapsedGroups` (a list of group ids). A missing or corrupt
     value falls back to the default.
   - The collapse button and "Affichage > Inspecteur" close and open
     the column. Every action that needs the inspector (G, R, A, F2, a
     form) opens it, as forms do today.

9. **What goes.**
   - `ui/alignment-panel.ts`, `styles/alignment-panel.css`, the
     `#alignment-panel` element of `index.html` and its wiring in
     `main.ts`.
   - `ui/gizmo-controls.ts` and the toolbar fields
     `gizmoAvailable`, `gizmoSteps`, `aligning` and `alignAvailable`
     of `view-model.ts`, which move to the inspector's view.
   - The labels `toolbar.gizmoMove`, `toolbar.gizmoRotate`,
     `toolbar.align`, `toolbar.gizmoStep*` and `alignment.close` in
     both locales.

10. **No core, protocol or schema change.** The routes stay
    `PUT .../placement` and `POST .../align`, and `schema_version` does
    not change. Optional, for a separate ADR if the user wants it: a dry
    run of the alignment (`POST .../align?dryRun=true` answering the
    placement without storing). The viewer could then show the result
    as a ghost before "Aligner".

11. **Undo stays out of scope.** One small, viewer-only addition is
    in scope (user answer 2): "Rétablir le placement précédent" in
    "Positionnement". It sends again the placement the selected
    assembly had before the last placement edit of this session
    (typed, dragged or aligned). It is offered only while the
    assembly's anchor is unchanged. An alignment that created a fixed
    joint changes the anchor, so it does not offer it. The value is
    forgotten when the Pantin is closed. It is not a history.

## Rejected alternatives

- **A floating positioning panel, movable over the 3D view.** It hides
  the bodies being placed and adds a third place to look. This is
  today's alignment box.
- **Two docked panels side by side (inspector and positioning).** Two
  columns eat the 3D view's width, and the same placement would still
  be shown twice.
- **A modal dialog for alignment or placement.** It blocks selection,
  diagram and clock while picking. Picking in 3D needs the view free.
- **Tabs in the inspector ("Propriétés" / "Positionnement").** The
  fields and the tools would again sit in places the user switches
  between. A folded section costs one click and keeps both visible.
- **Moving the inspector to the left, under the tree.** It is possible,
  but the tree and a long assembly inspector would share
  the same column. The right column already has the room, and ADR 0030
  placed it there.
- **Applying the alignment automatically on the last pick.** A misclick
  on the last face would move the part at once, with no undo. One
  Enter is cheap.
- **Ending the alignment on any selection change.** Moving to another
  assembly in the tree would lose the tool for no gain. Picks restart
  anyway (point 3).
- **A general undo history.** It needs inverse operations for every
  route (joint creation, deletions, imports). Point 11 covers the one
  case placing makes frequent.

## Consequences

- Placing a part happens in one column and the 3D view: fields, gizmo,
  steps, alignment and its result are read and changed in one place.
- ADR 0030 point 2, ADR 0034 points 1, 3, 5, 6 and 7, and ADR 0035
  points 3, 6 and 8 get "Amended by: ADR 0039". Their algorithms
  (frames, snapping, alignment kinds, API) are unchanged.
- The toolbar gets shorter. Positioning is found in the Édition menu,
  with its keys, and in the inspector.
- Tests that read the toolbar's gizmo and align fields move to the
  inspector's view model.
- To measure: inspector redraws per second during a gizmo drag with the
  live fields (point 5), on a Pantin of 50 assemblies.

### Slices

Each slice leaves `pnpm check` green and ships alone.

**P1. "Positionnement" section and toolbar cleanup.**
Files: new `inspector/positioning-view.ts` (pure: anchor, fields, tool
row, step, availability, body line), `inspector/inspector-model.ts`,
`properties/placement-groups.ts` (the fields move into the section),
new `ui/inspector-positioning.ts`, `ui/inspector.ts`, `ui/toolbar.ts`,
`view-model.ts`, delete `ui/gizmo-controls.ts`,
`properties/group-titles.ts` and the locales (joint group renamed).
Tests: `positioning-view.test.ts` (assembly, body, anchor name, tool
pressed, step shown for move or rotate only, disabled in the diagram
layout); `inspector-model.test.ts` and `node-inspector.test.ts`
(section order, joint titles distinct); `view-model` no longer exposes
gizmo fields.

**P2. Alignment inline.**
Files: `alignment/alignment-view.ts` (clock note only while running,
pick rows as buttons), `alignment/alignment-session.ts` (`currentPick`
for re-picking), `alignment/pick-resolution.ts` (fills the current
pick), `controller/alignment-actions.ts` (`chooseAlignmentPick`), new
`ui/inspector-alignment.ts` (committing fields), `ui/inspector.ts`,
`main.ts`, `index.html`. Delete `ui/alignment-panel.ts` and
`styles/alignment-panel.css`.
Tests: `alignment-session.test.ts` (re-pick keeps the others, the next
null pick follows); `alignment-view.test.ts` (note shown only while
running); `alignment-actions.test.ts` (re-pick, apply keeps kind and
parameters, empties the picks).

**P3. Tool rules and keys.**
Files: `controller/gizmo-actions.ts`, `controller/alignment-actions.ts`,
`controller/controller.ts` (selection change and empty click while a
tool is on), `gizmo/gizmo-spec.ts` (body selection resolves to its
assembly), `menu/menu-model.ts` and `menu/menu-context.ts` (enable
rules, new pure `escapeCommand(state)`), `ui/shortcuts.ts` (Escape in
the bubble phase).
Tests: `gizmo-actions.test.ts` and `alignment-actions.test.ts` (G/R/A
from a body select the assembly and open the inspector; selecting a
joint turns the tool off; another assembly restarts the picks);
`selection-actions.test.ts` (empty click keeps the selection while a
tool is on, clears it otherwise); `menu-model.test.ts`
(`escapeCommand`, enable rules).

**P4. Edit feedback.**
Files: `properties/property-rows.ts` and `ui/properties-grid.ts`
(invalid state per row), `controller/placement-actions.ts` (invalid
text stays in the field; the last dragged placement as
`placementDraft`), `viewer-state.ts`, `inspector/positioning-view.ts`.
Tests: `placement-actions.test.ts` (invalid text: no request, row
marked, message line untouched); `placement-drag.test.ts` (fields show
the drafted value during the drag and the document after it);
`positioning-view.test.ts` (Enter moves X to Y).

**P5. Layout and persistence.**
Files: `layout-sizes.ts` (`clampColumns`), `ui/pane-layout.ts`
(inspector splitter), `ui/browser-storage.ts` (three keys),
`viewer-state.ts` (initial open state and folded groups from storage),
`controller/drive-actions.ts` (`toggleInspector` stores),
`styles/base.css` and `styles/inspector.css` (width variable).
Tests: `layout-sizes.test.ts` (both columns clamped, inspector first,
corrupt values); `viewer-state.test.ts` (stored open state and folded
groups restored, corrupt list ignored).

**P6. Restore the previous placement.**
Files: `viewer-state.ts`, `controller/placement-actions.ts`,
`controller/alignment-actions.ts`, `inspector/positioning-view.ts`.
Tests: typed, dragged and aligned edits are each restorable once; not
offered after an anchor change or a fixed joint; forgotten on close.

### Exit criterion

On the user's Pantin "test" (linear axis `3630.00.0800N_0` and clevis
`chape_nd032a`, ADR 0033), with the clock paused and the "3D + Schéma"
layout:

1. Click the clevis in the 3D view. The inspector shows the clevis
   assembly with "Positionnement" first.
2. Press A, click the clevis mounting face, then the carriage top face.
   Click the first pick row and pick the clevis face again: the second
   pick is kept. Press Enter on "Aligner". The six fields show the new
   placement.
3. Press G and drag along X. The X field follows the drag. Type a value
   in Y and press Enter. Press Escape: the gizmo goes off and the
   selection is still the clevis.
4. Reload the page. The inspector width, its open state and the folded
   groups are as left.

At no step does a floating panel open, does the pointer go to the
toolbar, or does the selection leave the clevis. The clevis was
imported before ADR 0035, so its faces may be fallback planes only (NOT
VERIFIED). The axis kinds are then shown on the bearing block of
ADR 0035's exit criterion, whose three-step sequence must also run
without leaving the alignment block.

## Answers from the user (2026-10-03)

1. Side of the unified panel: on the right, resizable.
2. "Rétablir le placement précédent": yes, slice P6 is in scope.
3. Escape with picks made: leaves the alignment at once.
4. Gizmo and alignment buttons in the toolbar: removed.
