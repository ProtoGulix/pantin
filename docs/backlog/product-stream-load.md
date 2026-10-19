# Pose stream load from resting products

Phase: conveying and physics (after phase 6). ADR: 0043 point 9.

Products never sleep (ADR 0043 point 9) and a box resting on a stopped belt
creeps about 0.1 µm/s, so even with poses rounded to 1e-6 (ADR 0043 P3) each
resting box sends about one snapshot every 10 s (P3 review measurement,
2026-10-13). A few boxes are harmless; near the 500-product cap the stream
would run at its 30 Hz period. Levers when it shows up: let products sleep
(sleeping bodies are NOT VERIFIED, spike 0002), or a coarser rounding grid.
