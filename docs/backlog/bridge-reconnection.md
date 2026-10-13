# Bridge reconnection

The bridge exits when the tag bus closes or sends `io_changed` (ADR 0045
point 10). Since ADR 0049, every edit of the I/O mapping in the viewer sends
`io_changed`, so commissioning means restarting the bridge after each edit.
A bridge that reconnects, reloads the mapping and swaps its slaves without a
manual restart would remove that step. It needs its own ADR: what the PLC
sees while the slaves are swapped, and how the watchdog treats the gap.
