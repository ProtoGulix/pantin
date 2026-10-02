# Spike 0007: CAD navigation and standard views (SolidWorks, ZW3D, ISO)

Date: 2026-10-02. Babylon.js checked in the installed `@babylonjs/core` 9.28.0 d.ts. Web facts come from search results and fetched pages; where a page could not be fetched (403, JS-rendered), the fact is marked "search snippet".

## 1. Navigation mapping

| Action | SolidWorks default | ZW3D default | Source |
|---|---|---|---|
| Rotate | Middle drag | Right drag (hold RMB and move) | SW: [help 2021 Middle Mouse Button](https://help.solidworks.com/2021/English/SolidWorks/sldworks/r_Middle_Mouse_Button.htm) (search snippet); ZW3D: [ZW3D CAD Lesson 1, section 1.3](https://zw3d.zwspain.com/docs/CAD%20Lesson1---ZW3D_Introduction.pdf) and [CAD Fundamentals V2017](http://www.3cad.com.au/zw3d/training/CAD_Fundamentals.pdf) |
| Pan | Ctrl + middle drag | Middle drag (no modifier) | same sources |
| Zoom | Wheel; Shift + middle drag | Wheel | same sources |
| Wheel direction | Forward (away) = zoom out, back (toward you) = zoom in; option "Reverse mouse wheel zoom direction" (Tools > Options > System Options > View) | not found | [SW blog, manipulate your model view](https://blogs.solidworks.com/products/solidworks/how-do-i-manipulate-my-model-view-let-me-count-the-ways/); option name from SW help search snippet |
| Wheel zoom centre | Zooms about the point under the cursor, then drifts it toward the screen centre; a "zoom around centre of screen" option exists | not found | same SW blog; [mycad forum snippet](https://forum.mycad.visiativ.com/t/zoom-souris-et-molette/102897) |
| Rotation centre | Auto: picks geometry in view and rotates about it. Middle-click a vertex/edge/face then middle-drag = rotate about that entity | "Dynamic rotate rotates about the view origin"; Ctrl+1 = set rotation centre; 3D mouse centre can be "View Origin" | SW blog; SW help snippet; ZW3D Fundamentals PDF; [ZWSOFT base-skills 1364](https://www.zwsoft.com/support/zw3d-base-skills/1364) |
| Roll (about screen normal) | Alt + middle drag; Alt + Left/Right arrows | F4 held + rotate = rotate about the display axis (perpendicular to screen); F3 held = rotate about Z | SW blog; ZW3D Fundamentals PDF |
| Arrow keys | Rotate 15 deg (configurable: Tools > Options > View > View rotation); Shift = 90 deg; Ctrl = pan; Alt+Left/Right = roll | Ctrl + arrows give standard views (not rotation) | [Javelin / SW help snippets](https://www.javelin-tech.com/blog/2013/11/solidworks-tutorial-keyboard-and-mouse-controlling-the-viewport-orientation/) (snippet); ZW3D Lesson 1 section 3.3 |
| Left-drag in empty space | Box selection (NOT verified in a fetched page) | Left = pick (LMB picks entities). Fundamentals PDF says "RMB drag rotate, LMB drag pan" in one sentence, contradicting its own list: ambiguous | ZW3D Lesson 1; Fundamentals PDF |
| Right click | SW: context menu; right-drag = mouse gestures (default: standard views) | RMB click = right menu; hold+move = rotate | SW blog; ZW3D Lesson 1 |
| Zoom to fit | F; also Zoom to Fit command | Ctrl+A ("Zoom All" in the document toolbar) | SW blog; ZW3D Fundamentals PDF |
| Previous view | Ctrl+Shift+Z | not found | SW blog |
| Middle click | (rotate button) | Confirm / repeat last command | ZW3D Lesson 1 |
| Selection-based zoom | Zoom to Selection (shortcut not verified) | not found | |

Second source for the SolidWorks mapping (confirmed, three of three): FreeCAD "SolidWorks" navigation style = zoom wheel or Shift+middle, rotate middle, pan Ctrl+middle ([FreeCAD wiki Mouse_Model](https://wiki.freecad.org/Mouse_Model), search snippet; direct page fetch blocked). Fusion 360 "SolidWorks" preset = zoom Shift+wheel/middle, pan Ctrl+middle, orbit middle ([Autodesk Fusion blog](https://www.autodesk.com/products/fusion-360/blog/quick-tip-pan-zoom-orbit-preferences/), search snippet; fetch 403). Onshape has a SolidWorks mouse profile (forum snippets), but its exact bindings were not retrieved. Onshape arrow keys: 15 deg, Shift 90 deg, Ctrl 5 deg ([Onshape help](https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm), fetched).

ZW3D "SolidWorks style" mouse mode: NOT found. ZW3D says it supports "mouse and gesture configuration", user-role customisation of UI/hotkeys/mouse actions ([switch-to-zw3d](https://www.zwsoft.com/product/zw3d/switch-to-zw3d), Lesson 1 section 1.4) and can be adapted to UG, CATIA, SolidWorks users (search snippet). Whether it ships a named SolidWorks preset is NOT VERIFIED.

## 2. Standard views

SolidWorks Ctrl+1..7 confirmed by multiple search results (Front, Back, Left, Right, Top, Bottom, Isometric); Ctrl+8 = Normal To (selection dependent). Source: [vagon.io SW shortcuts](https://vagon.io/blog/solidworks-keyboard-shortcuts-mouse-gestures-guide), [CATI](https://www.cati.com/?p=122314) (snippets). Space bar opens the Orientation dialog / view selector cube (SW help snippet, [r_View_Toolbar](https://help.solidworks.com/2022/English/SolidWorks/acadhelp/r_View_Toolbar_MovingFrom2Dto3D.htm)). SolidWorks also offers Trimetric and Dimetric. Since SW 2020 a "Up axis" option switches Y-up to Z-up views ([SW 2020 What's New](https://help.solidworks.com/2020/English/WhatsNew/t_view_up_axis.htm), snippet only).

ZW3D: "Ctrl + U/I/Arrow key" give the standard views, Ctrl+Home = closest view, Ctrl+Home on a datum plane or planar face = align to it (Lesson 1, section 3.3). The exact key to view mapping is NOT VERIFIED. Note the clash: ZW3D Ctrl+1 = set rotation centre, so Ctrl+1..8 must NOT be copied from SolidWorks if Pantin wants ZW3D habits.

Look directions for a Z-up model (convention in Z-up CAD: Front = X to the right, Z up, looking along +Y, so the camera sits at -Y). Sources: CATIA tool doc "front = looking along +Y; Z up" ([glama catia_set_view](https://glama.ai/mcp/servers/AstroQuestStudio/catia-v5-mcp/tools/catia_set_view), third-party, fetched); Bentley doc "Front: x right, z up, y away" (search snippet). SolidWorks Y-up default: Front plane = XY, viewed along -Z. NX and ZW3D look-directions NOT directly verified.

| View (EN / FR) | Camera position | Looks along | Screen right / up | SW key | ZW3D key |
|---|---|---|---|---|---|
| Front / de face | -Y | +Y | +X / +Z | Ctrl+1 | unknown (Ctrl+U/I/arrow family) |
| Back / arrière | +Y | -Y | -X / +Z | Ctrl+2 | unknown |
| Left / de gauche | -X | +X | +Y / +Z | Ctrl+3 | unknown |
| Right / de droite | +X | -X | -Y / +Z | Ctrl+4 | unknown |
| Top / de dessus | +Z | -Z | +X / +Y | Ctrl+5 | unknown |
| Bottom / de dessous | -Z | +Z | +X / -Y | Ctrl+6 | unknown |
| Isometric | (+X, -Y, +Z) octant, see below | toward origin | - | Ctrl+7 | unknown |

The right column pair is derived geometry (a right-handed frame), not quoted from a vendor.

## 3. ISO conventions

- ISO 5456-2 defines the two projection methods; ISO 128-3 (2020/2022) covers views and projection symbols. First-angle (European, ISO default, formerly "method E") vs third-angle (US, formerly "method A"). Sources: [ISO 128-3 catalog](https://iteh.es/catalog/standards/iso/7a9da10e-d4e1-469f-8837-5df5790a32a0/iso-128-3-2020), [Wikipedia Multiview orthographic projection](https://en.wikipedia.org/wiki/Multiview_orthographic_projection) (fetched). Wikipedia says first-angle is standard in Europe and Asia (excluding Japan), third-angle in USA, Japan, Canada, Australia.
- Six views, French names under NF EN ISO 5456-2: vue de face, de dessus, de dessous, de gauche, de droite, d'arrière (search snippet from a French page). The letters A to F per ISO 128-30 (A face, B dessus, C gauche, D droite, E dessous, F arrière) are from memory, NOT VERIFIED (the standard text is paywalled).
- In first-angle layout the view of the object seen from above sits BELOW the front view, and the view from the left sits to the RIGHT of it. The camera directions in the table do not depend on the projection method; only the sheet layout does. This matters only if Pantin ever generates a drawing sheet.
- Isometric: three axes at 120 degrees, equal foreshortening; obtained by rotating 45 deg about the vertical axis then 35.264 deg (arcsin(1/sqrt 3)) about a horizontal axis ([Wikipedia Isometric projection](https://en.wikipedia.org/wiki/Isometric_projection), fetched). Dimetric: two equal axes; trimetric: three different ([Onshape help](https://cad.onshape.com/help/Content/View/isometric_dimetric_trimetric_projections.htm), fetched). NX offers both an isometric and a trimetric standard view (search snippet). Onshape view cube exposes Isometric, Dimetric, Trimetric.
- Default isometric octant: for Z-up with Front looking along +Y, the natural choice is camera at (+X, -Y, +Z) (you see front, right, top faces). CATIA's doc says "from (+X+Y+Z) corner" (third-party tool doc, possibly using a different Front sign; NOT VERIFIED). SolidWorks, ZW3D and NX octants NOT VERIFIED from a vendor page.

## 4. Recommended Pantin mapping

| Topic | SW vs ZW3D | Recommendation and why |
|---|---|---|
| Mouse | SW: middle rotate, Ctrl+middle pan. ZW3D: right rotate, middle pan | User wants "like SolidWorks, or at least ISO". Default to the SolidWorks scheme (confirmed by FreeCAD and Fusion presets) and expose a second preset "ZW3D" (right rotate, middle pan), since the user also works in ZW3D. Preset switch is cheap with the 9.x inputMap |
| Wheel | SW: forward = zoom out; ZW3D unknown | Wheel zooms toward the cursor, SW direction by default, with a "reverse" toggle |
| Left-drag empty space | SW: box select | Keep left = select; box selection later |
| Rotation centre | SW: auto point under cursor; ZW3D: view origin | Rotate about the point under the cursor at press time (fallback: scene or selection centre). Works for both habits |
| Fit | SW: F; ZW3D: Ctrl+A | Bind F (and double middle click, unverified in SW) to fit; also Home |
| Standard view keys | SW Ctrl+1..7; ZW3D Ctrl+1 conflicts | Use SolidWorks Ctrl+1..7 plus a clickable view cube, because the ZW3D key mapping is unknown and conflicts |
| Arrow keys | SW 15/90/Ctrl pan/Alt roll | Copy SW (same as Onshape, a second source) |
| Axes | Z up everywhere in Pantin core | Use the Z-up table above, Front looks along +Y. Isometric from (+X, -Y, +Z) |
| Projection | SW default perspective-capable; CAD views usually orthographic for standard views | Perspective default for the scene, a toggle to orthographic, and snap to orthographic when a standard view is chosen (decision for the user; CAD default NOT VERIFIED) |
| Transition | SW animates view changes | Animate, about 300 to 500 ms (the value is my suggestion, no source) |

## 5. Babylon.js 9.28.0 feasibility (checked in d.ts and js)

| Need | Finding |
|---|---|
| Button and modifier mapping | 9.x has `camera.movement.input` (an `InputMapper`, `Cameras/inputMapper.d.ts`) with an ordered `inputMap` of `{source, button, modifiers:{ctrl,shift,alt}, interaction: "pan"|"rotate"|"zoom", sensitivity}`; first match wins; `addEntry`, `getEntry`, `setInteraction`, reset. Default map (in `arcRotateCameraMovement.js`): Ctrl+left = pan, left = rotate, right = pan, wheel = zoom, keyboard Ctrl = pan, keyboard Alt = zoom, keyboard = rotate. So the SW scheme is: rotate on button 1, pan on button 1 + ctrl, zoom on button 1 + shift (pointer, with vertical delta driving zoom: needs a test), nothing on left. The legacy `inputs.attached.pointers.buttons` (default [0,1,2]) still exists, and `_useCtrlForPanning` / `_panningMouseButton` are marked internal, backward compatibility only |
| Zoom to cursor | `zoomToMouseLocation` on `camera` (`arcRotateCamera.pure.d.ts`) and on the wheel input; `wheelDeltaPercentage` / `wheelPrecision` for speed. Direction reversal: negative `wheelPrecision` (not verified here) |
| Orthographic | `camera.mode = Camera.ORTHOGRAPHIC_CAMERA` (= 1), `orthoLeft/Right/Top/Bottom`. ArcRotateCamera does NOT update the ortho bounds from `radius` on wheel zoom: `zoomOn()` sets them once from the radius. Wheel zoom in ortho mode therefore needs custom code that rescales ortho bounds (verified by reading `zoomOn`; behaviour of the wheel input in ortho mode not tested) |
| Animated view change | `camera.interpolateTo(alpha, beta, radius, target, targetScreenOffset, factor)` exists; standard views are (alpha, beta) pairs, with Z-up needing the `upVector` set once |
| Zoom to fit | `zoomOn(meshes)`, `useFramingBehavior`, `focusOn` |
| Rotate about cursor | No built-in; needs a pick (`scene.pick`) at pointer down then retarget (`setTarget` while preserving position). Custom |
| Double middle click | `BaseCameraPointersInput.onDoubleTap` exists (Left button semantics not checked) |
| View cube | NOT built in (no ViewCube or ViewHelper in the core d.ts; forum threads [viewcube-actions](https://forum.babylonjs.com/t/viewcube-actions/23928), [camera-gizmo-blender-like](https://forum.babylonjs.com/t/camera-gizmo-blender-like/37363) show community demos only). Needs a custom second scene or a rendering layer, plus pointer picking of faces, edges, corners |
| Z-up | ArcRotateCamera is Y-up by default; `upVector` setter exists (`arcRotateCamera.pure.d.ts` line 83) and rotates the internal matrices. Conversion at the viewer boundary only (CLAUDE.md section 5) |

## 6. NOT VERIFIED

1. SW double-click middle = zoom to fit (no fetched source).
2. SW left-drag empty space = box selection, right-click = context menu (known behaviour, no fetched page).
3. SW help pages are JS-rendered and could not be fetched; SW mouse, arrow-key and 15 deg default facts rest on search summaries and the SW blog.
4. ZW3D: key to view mapping for Ctrl+U/I/arrows, Front/Top definition, isometric octant, view cube, existence of a SolidWorks mouse preset, zoom-to-cursor default, wheel direction. ZW3D help (help.zwsoft.com) was not reachable. The Fundamentals PDF is V2017, behaviour in current versions unconfirmed.
5. ISO 128-30 letters A to F, and exact French names (one French snippet only).
6. Isometric octant used by SolidWorks, ZW3D, NX, and whether CATIA's "(+X+Y+Z)" uses the same Front sign.
7. Onshape SolidWorks preset bindings.
8. Orthographic default in SolidWorks/ZW3D standard views.
9. Babylon: pointer interaction "zoom" via Shift + middle drag (does the pointers input route vertical drag to `zoom`?), wheel direction reversal, wheel in ortho mode: not run, only read.
10. FreeCAD and Fusion pages were read through search snippets (direct fetch blocked).
