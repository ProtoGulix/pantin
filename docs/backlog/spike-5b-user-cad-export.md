# Spike 5b: export from the user's own CAD

Phase: spikes and checks. ADR: 0009, 0041, 0055, 0056. Report: spike 0011.

On hold (2026-10-20): needs a file exported by the user's own CAD software.
Spike 0011 measured the STEP import on catalogue and translated files only.

To check, then add to spike 0011:

- a STEP exported by the user's CAD, with named sub-assemblies: names,
  frames, groups created by the import;
- a pivot set on a real shaft or axle: face picked for the axis, axis
  reversed if needed, rotation checked on screen;
- a glTF or STL exported directly by that CAD, if it can.
