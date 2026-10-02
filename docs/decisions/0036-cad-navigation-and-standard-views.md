# 0036. CAD navigation and standard views in the 3D view

- Status: proposed
- Date: 2026-10-02
- Extends: ADR 0016 (viewer conventions), ADR 0034 (gizmo, browser settings)
- Sources: spike 0007 (docs/spikes/0007-cad-navigation-and-standard-views.md)

## Context

The user designs machines in ZW3D and knows SolidWorks. The 3D view
navigates like a game viewer: left drag orbits, right drag pans, the wheel
zooms towards the centre of the view, the projection is always perspective,
and there are no standard views (`scene/camera-framing.ts`, Babylon.js
`ArcRotateCamera`). The user asked for navigation "like a CAD: SolidWorks, or
at least an ISO way", and for standard views (top, bottom, sides).

Spike 0007 found:

- SolidWorks: middle drag rotates, Ctrl + middle drag pans, Shift + middle
  drag zooms, the wheel zooms about the cursor (forward zooms out by default,
  with a "reverse" option), Alt + middle drag rolls. Arrow keys rotate 15°
  (setting), Shift + arrows 90°, Ctrl + arrows pan. F fits the view.
  Ctrl+1 to Ctrl+7 give Front, Back, Left, Right, Top, Bottom, Isometric;
  Ctrl+8 is Normal To; Space opens the orientation dialog. Confirmed by the
  "SolidWorks" presets of FreeCAD and Fusion 360.
- ZW3D: right drag rotates, middle drag pans, the wheel zooms; Ctrl+1 sets
  the rotation centre (clashes with SolidWorks). Its view shortcuts and
  isometric octant are NOT VERIFIED.
- ISO 5456-2 / ISO 128-3: first angle (European) and third angle projection
  differ only in how views are laid out on a sheet; the direction each view
  looks along is the same. Six principal views plus the isometric (axes at
  120°).
- Babylon.js 9.28.0: `camera.movement.input` maps pointer buttons and
  modifiers to rotate, pan and zoom; `zoomToMouseLocation`; orthographic
  mode with `orthoLeft/Right/Top/Bottom` (wheel zoom in that mode needs our
  own bound scaling); `interpolateTo` for animated moves. No view cube is
  built in.

NOT VERIFIED (spike 0007): SolidWorks double middle click = fit and left
drag in empty space = box selection; whether SolidWorks and ZW3D standard
views are orthographic by default; the isometric octant used by SolidWorks,
ZW3D and NX; whether browsers let a page take Ctrl+1 to Ctrl+7 (Chrome and
Firefox switch tabs with them).

## Decision

1. **Navigation presets.** Two presets, chosen in the viewer's settings
   (kept in the browser like the gizmo steps, ADR 0034 point 5), SolidWorks
   by default:

   | Action | SolidWorks (default) | ZW3D |
   |---|---|---|
   | Rotate | middle drag | right drag |
   | Pan | Ctrl + middle drag | middle drag |
   | Zoom | wheel, Shift + middle drag | wheel |
   | Select | left click | left click |
   | Context menu | right click (no drag) | none on right drag |

   Left drag in empty space does nothing; it is kept for box selection
   (backlog). The gizmo (ADR 0034) keeps the left button.
2. **Zoom.** The wheel zooms towards the point under the cursor. Default
   direction per preset (SolidWorks: forward zooms out); a "reverse wheel"
   setting flips it.
3. **Rotation.** Turntable: Z stays vertical on screen (machines stand on a
   floor; the Babylon camera does it natively). The rotation centre is the
   point of a body under the cursor when the rotate drag starts, else the
   current target. No roll (Alt + middle drag, Alt + arrows): free rotation
   and roll need a camera of our own, backlog until asked.
4. **Standard views.** Seven views, Z up, model axes as stored (core frame):

   | View | French label | Camera on | Screen right | Screen up |
   |---|---|---|---|---|
   | Front | Face | -Y | +X | +Z |
   | Back | Arrière | +Y | -X | +Z |
   | Left | Gauche | -X | -Y | +Z |
   | Right | Droite | +X | +Y | +Z |
   | Top | Dessus | +Z | +X | +Y |
   | Bottom | Dessous | -Z | +X | -Y |
   | Isometric | Isométrique | (+X, -Y, +Z) | | +Z on screen vertical |

   The isometric looks from the front right top octant, the SolidWorks
   isometric with its Y up turned to Z up. A view change keeps the target
   and the distance, and animates in 300 ms. They are in the Affichage menu,
   on the view cube (point 5), and on Ctrl+1 to Ctrl+7 in the SolidWorks
   order if the browser lets the page take them; otherwise the menu shows
   no shortcut for them (no other key is invented).
5. **View cube.** A small cube in the top right corner of the 3D view turns
   with the camera. Its six faces carry the French view names and switch to
   that view on click; its edges and corners switch to the view between
   them. It is drawn in HTML with CSS 3D transforms (crisp text, labels from
   the typed catalogue), synced to the camera each frame; it holds no camera
   logic of its own.
6. **Projection.** Orthographic by default, as on a drawing: a standard
   view then shows true lengths. "Perspective" in the Affichage menu
   toggles it, kept in the browser. In orthographic mode the wheel zoom
   scales the ortho bounds about the cursor.
7. **Keyboard.** Arrow keys rotate by 15° (setting), Shift + arrows by 90°,
   Ctrl + arrows pan, F fits everything (the "Tout cadrer" command, which
   has no shortcut today). Space opens the list of standard views at the
   pointer. Keys are ignored while typing in a field, like G and R.
8. **Where the code lives.** Pure, tested modules hold the preset tables,
   the view directions and the camera angles they give, the ortho bound
   scaling and the arrow key steps; the Babylon glue stays thin. Nothing
   here touches the core or the document.

## Rejected alternatives

- Keeping the current game-like navigation with a few view buttons: the
  user asked for CAD habits; a designer's hand goes to the middle button.
- ZW3D as the only scheme: its view shortcuts are undocumented and Ctrl+1
  clashes with SolidWorks; offered as a preset instead.
- Free (trackball) rotation as in SolidWorks: loses "Z up" on screen, needs
  a camera of our own and roll; backlog if the user asks.
- A view cube rendered in Babylon (second camera or layer): more code for
  picking and text than CSS 3D, for the same result.
- Inventing other keys when the browser keeps Ctrl+1 to Ctrl+7: a shortcut
  nobody knows from CAD is no better than the menu and the cube.

## Consequences

- The viewer gains a navigation module, a view cube and three settings
  (preset, reverse wheel, arrow step) plus the perspective toggle.
- Users on a laptop without a middle button navigate with the view cube,
  the arrow keys and the wheel (NOT VERIFIED that this is enough; a
  "touchpad" preset can follow if asked).
- Ctrl+8 "Normal To" (view square to a picked face) waits for face picking
  (ADR 0035).
- Previous view (SolidWorks Ctrl+Shift+Z), box selection, roll and free
  rotation go to the backlog.
- To verify at implementation: Ctrl+1 to Ctrl+7 in Chrome and Firefox on
  Linux; Shift + middle drag zoom through Babylon's input map; wheel zoom
  in orthographic mode.
- Exit criterion: a user demonstration on the Pantin "test": orbit, pan and
  zoom with the SolidWorks mouse, then Face, Dessus and Isométrique from the
  cube and the keyboard.
