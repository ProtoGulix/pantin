# Console, diagram, welcome and placement extras

Phase: 8 (editing). ADR: 0027, 0029, 0031, 0033, 0035.

## Why

Small follow-ups that ADRs sent to the backlog and no file held.

## What

- Console (ADR 0031): export as text; codes for sensors (a sensor changing
  state, as a trace for the PLC program); diagnostics on the tag bus.
- Chain diagram (ADR 0029): a filter by name or tag; a print or PDF export as
  machine documentation. The side by side split is done (ADR 0030).
- Welcome window (ADR 0027): "Open an example" needs an endpoint that copies
  an example into the Pantins folder.
- Placement (ADR 0033): the viewer cannot edit a body placement; only the core
  writes it.
- Alignment (ADR 0035): keep the picked face references with the placement
  (needs a stable face identity, indices change on re-import); a route to
  re-import a body in place; more alignment kinds (distance, angle, tangency).
