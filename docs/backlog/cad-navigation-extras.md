# CAD navigation extras

Left out of ADR 0036 (CAD navigation and standard views):

- Touch and touchpad: the SolidWorks and ZW3D presets bind mouse buttons
  only, so a touchscreen no longer rotates, and the camera distance set
  each frame cancels Babylon's pinch zoom. A "touchpad"
  preset if the user asks.
- Box selection with a left drag in empty space (kept free for it).
- Free (trackball) rotation and roll (SolidWorks Alt + middle drag,
  Alt + arrows): need a camera of our own.
- Previous view (SolidWorks Ctrl+Shift+Z).
- "Normal To" (SolidWorks Ctrl+8): waits for face picking (ADR 0035).
