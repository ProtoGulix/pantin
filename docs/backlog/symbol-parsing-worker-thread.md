# Symbol parsing in a worker thread

Phase: PLC bridge (after phase 7). ADR: 0064.

## Why

The preview of a PLC symbol import (`POST .../io/symbols/preview`) reads and matches the
file on the core's event loop. About 0.8 s at 7 MiB was measured in review. That blocks the
simulation loop and the bus for that time. It was accepted for a localhost user action that
happens rarely (ADR 0064, amendment of 2026-10-21), but a shared server would feel it.

## What

Run the XML read, the symbol expansion and the matching in a `worker_threads` worker, with
the same limits, and answer the route when it ends. The functions are pure and take the text,
so the worker only needs the file text and the open mapping's channels and tags.

## When

When a symbol file over a few MiB is common, or when the core serves several users.
