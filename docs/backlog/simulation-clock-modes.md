# Simulation clock modes

Further modes on top of the clock control of ADR 0032 (pause, step, achieved
ratio), kept out of it on purpose:

- As-fast-as-possible runs for the CLI and the CI scenario tests (phase 9):
  the core steps without waiting for the wall clock.
- Record and replay of command tag writes keyed by step number (after
  phase 7), so that a scenario replays bit for bit.
- A speed factor, allowed only when no bridge is connected.

Why a speed factor waits: a PLC keeps its own time (CODESYS standard timers
read the runtime clock), so a speed other than 1x, or a pause, makes PLC
timeouts inconsistent with the simulated machine. A PLC in the loop only
makes sense at 1x. The 1 ms step of the original proposal contradicts
ADR 0005 (1/120 s). Worth an ADR when phase 9 needs the first of these.
