# Desktop app, and a core without Python

Phase: 9 (distribution). ADR: 0001, 0004, 0007, 0008, 0009, 0045, 0048, 0050.

On hold (2026-10-20): the user is weighing an Electron desktop app. A first
study (architect, 2026-10-20, not committed as an ADR) found that the window
is the small part of the problem.

What the study found in the repository:

- Install today needs git, Node 24, pnpm, Python, bash and a terminal;
  `pnpm serve` and both `setup.sh` use POSIX venv paths (`.venv/bin/python`).
  CI runs on Linux only and no Windows host was tested (ADR 0050).
- Both sidecars need Python: the bridge (hand-written Modbus slave and
  `websockets`, ADR 0048) and the STEP converter (`cadquery-ocp-novtk`,
  ADR 0009). Electron would not remove either.
- The core already runs without any window: closing the browser leaves the
  simulation and the bridge running, so a "detached" mode is a matter of
  not killing the core when the window closes, plus an explicit Quit that
  checks unsaved changes.

Direction discussed with the user, in order, each step with `pnpm check`
green:

1. The bridge rewritten in TypeScript, still a separate process (ADR 0007
   refuses it inside the core). Spike 0003 measured that Node rejects a
   source address before any read. Needs an ADR superseding the language
   choice of ADR 0007 and 0048.
2. A spike on STEP in WebAssembly (opencascade.js, occt-import-js), on the
   spike 0011 files: names, placements and, above all, the face files that
   "Prendre l'axe sur une face" needs. Licence and size NOT VERIFIED. If it
   fails, Python stays for the converter.
3. A Windows CI job (no Windows VM is available to the user).
4. An Electron spike, then an ADR: a `packages/desktop` that only spawns the
   unchanged core, one hardened window on `http://127.0.0.1:<port>`
   (`contextIsolation`, `sandbox`, no `nodeIntegration`, navigation limited
   to the core), after the CSP item (`viewer-inline-theme-script-csp.md`).

Rejected in the study: the core inside Electron's main process (CLAUDE.md
3.1), Tauri (still ships Node and Python, plus Rust), Docker only (heavy for
amateurs; Docker stays the server mode).

Every new dependency (electron, a packager, a WASM OpenCascade) needs the
user's agreement (CLAUDE.md 8).
