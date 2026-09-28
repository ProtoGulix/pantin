# 0009. STEP import through a Python OpenCascade converter

- Status: accepted
- Date: 2026-09-28
- Source: spike 0001 (docs/spikes/0001-step-to-mesh.md)

## Context

Users import STEP files from their CAD (CLAUDE.md section 10). The browser
cannot read STEP. Spike 0001 converted a real assembly with OpenCascade
(`cadquery-ocp`), keeping names, units and component placements. The user
approved on 2026-09-28 a Python converter run by the core.

## Decision

1. A new Python package `packages/step-converter` converts one STEP file into
   one GLB per leaf component of the assembly. It depends on
   `cadquery-ocp-novtk` 8.0.1.0.0 (bindings Apache-2.0, OpenCascade kernel
   LGPL 2.1 with the Open CASCADE exception 1.0), the same bindings as
   `cadquery-ocp` without the unused 640 MB `vtk` dependency. Development
   tools, required for Python by CLAUDE.md section 8: ruff, mypy (strict),
   pytest, all pinned.
2. The core runs the converter as a child process, never in its own process:
   a crash or a hang in the C++ kernel cannot take the core down. The core
   passes the Python interpreter path explicitly (`--step-converter-python`);
   without it, STEP import answers `conversion_unavailable`.
3. Process contract (the core validates the output with a Zod schema):

       <python> -m pantin_step_converter --input <file.step> --output-dir <dir>

   - Exit code 0: stdout is one JSON object
     `{"sourceUnit": "mm", "components": [{"file": "0.glb", "name": "...",
     "nodes": [{"name": "...", "path": [0, 1]}]}]}`; each `file` is a GLB in
     `<dir>`, in metres, Z up, keeping the component placement as its node
     transform so that all bodies show up in place.
   - Exit code 2: the input is not a usable STEP file; stdout is
     `{"error": "<actionable message>"}`, mapped to `conversion_failed`.
   - Any other exit code, invalid JSON, or a run longer than the time limit
     (default 120 s, then the process is killed): `conversion_failed`, with
     the details logged by the core, not sent to the client.
4. Every leaf component becomes one body: id derived from the component name,
   display name = component name, `source.format` = "step", `source.unit` =
   "m" (unit of the converted mesh), `source.upAxis` = "z", `source.nodes` =
   the component's STEP node names and index paths, verbatim. The mesh format
   is read from the extension of `mesh` (always .glb here).
5. The import route returns `{ "bodies": [...] }` for every format (one body
   for GLB and STL).
6. The upload goes to a private temporary directory, the converter writes to
   another one, and the core moves the GLBs into `meshes/` with exclusive
   creation. Temporary directories are always removed.

## Rejected alternatives

- `cadquery-ocp` with vtk: 800 MB for nothing used.
- opencascade.js (WASM, one language): not tested in spike 0001; revisit if
  the Python dependency becomes a burden.
- Conversion in the browser: impossible without shipping OpenCascade to it.
- One body per STEP file: the moving parts (e.g. the carriage of spike 0001)
  must be separate bodies to be animated later.

## Consequences

- The separate process isolates crashes, not malicious files: it is not a
  sandbox. Server mode with untrusted uploads needs a real sandbox first
  (CLAUDE.md section 11.3).
- CI installs Python and the converter's pinned requirements.
- Test fixtures are synthetic assemblies built with OpenCascade: generated at
  test time in the converter's tests, and one committed copy
  (`packages/core/src/test-support/fixtures/axis-assembly.step`) for the core's
  end to end test. The user's CC BY-ND part never enters the repository.
- Server mode also needs caps on the number of components and on the size of
  each converted GLB, which the core currently reads whole into memory.
