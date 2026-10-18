# Remove the redundant fixed joints of existing Pantins

Left out of ADR 0055, 2026-10-18. Since ADR 0055 a body with no joint of its
own follows its group, so the fixed joints that ADR 0017 and ADR 0040
point 3 created inside an assembly are redundant. The migration keeps them
valid. A command could list and delete them, refusing the ones a drive, an
actuator, a sensor or a belt references.
