# Nested assemblies: extras

Left out of ADR 0040 (nested assemblies that follow the STEP tree), 2026-10-04:

1. Collapse a sub-assembly into one rigid body. Bought parts such as
   bearings import as sub-assemblies of many bodies (20 and 18 bodies in
   `Translateur SCIE.step`), which adds noise to the tree and the joints.
2. Guess a slider or pivot axis from the geometry (for example by picking
   the rod's cylindrical face, from the face files of ADR 0035), instead
   of the default axis [0, 0, 1] of the assembly frame.
3. Metallic appearance for CAD colours named as metals ("Acier - Satiné"):
   the converter makes every material matte and non metallic
   (glb_materials.py).
