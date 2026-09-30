# Drives panel polish

Found in the review of the phase 4 viewer batch (ADR 0022):

- Deleting a drive asks no confirmation, unlike bodies and joints
  (pendingDeleteBodyId, pendingDeleteJointId); discarding the unsaved changes
  undoes it meanwhile.
- A value typed in a float command input is lost when the panel redraws after
  focus left the input (for example after ticking a fault); it is not kept in
  the viewer state.
- Tag values are polled four times a second; the tag bus (CLAUDE.md section 9)
  should push them instead.
