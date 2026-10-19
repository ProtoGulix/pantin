# Bridge reconnection

Phase: PLC bridge (after phase 7). ADR: 0045 point 10, 0049, 0050.

## Why

The bridge exits when the tag bus closes or sends `io_changed`. Since ADR 0049
every edit of the I/O mapping sends `io_changed`, so commissioning means
restarting the bridge (one click, ADR 0050 point 8) after each edit.

## What

A bridge that reconnects, reloads the mapping and swaps its slaves without a
manual restart. Needs its own ADR: what the PLC sees while the slaves are
swapped, how the watchdog treats the gap, and what happens during a briefly
invalid mapping. ADR 0050 rejected an automatic restart after a crash (it
hides configuration errors and makes the PLC see a flapping slave); this item
only covers `io_changed`.
