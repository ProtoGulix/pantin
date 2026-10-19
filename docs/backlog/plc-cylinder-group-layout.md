# plc-cylinder: rebuild the example with the group layout

Phase: debt (example). ADR: 0055.

`examples/plc-cylinder` keeps the layout from before ADR 0055: an inner fixed
joint `ecrou`, the slider `verin` inside the assembly `verin1`, and tags
`verin1.*`. The user guide tutorial now builds a group `Tige` held by a joint
whose tags start with `tige` (`tige.verin.position`, `tige.verin-min.state`...).

To do:

- rebuild the example with the group layout, so it matches the tutorial;
- re-check the CODESYS mapping and the GVL variable names (verified on
  2026-10-18 with the old tags `verin1_verin_position`...), then update the
  names in `docs/site/guide/connect-a-plc.md` (French and English).

Still true on 2026-10-19: `examples/plc-cylinder/pantin.json` has the assembly
`Verin1` and `io.json` the `verin1` names. Opening it also makes the core print
the ADR 0055 migration warning (see `ui-polish-from-docs.md`).
