# PLC bridge extras

Phase: PLC bridge (after phase 7). ADR: 0045, 0048, 0049.

## Why

Items ADR 0045 sent to the backlog. Carrying key renames into the mapping is
done by ADR 0049 (io.json follows renames). The rest is open.

## What

- Forcing a feedback tag (a broken sensor); today only command tags can be
  written or forced.
- Scaled INT for analog modules; today values are SI or percent, unscaled.
- A fail-safe value per tag; the watchdog only resets bit commands.
- One listen address per module (IP aliases) instead of one for all modules.
- Accept unit id "any" (broadcast-style match) in the slave.
- Diagnostics (ADR 0031 point 4) on the tag bus.
