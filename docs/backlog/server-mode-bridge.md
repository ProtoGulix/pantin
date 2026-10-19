# Bridge in server mode (docker compose)

Phase: 9 (community and instances). ADR: 0050, 0046, 0001, 0004.

## Why

The viewer starts the bridge as a child process of the core (ADR 0050). In
server mode compose does not pass `--bridge-python`, so the feature stays off.
ADR 0046 plans a separate container, which the spawn model does not cover.

## What

An ADR for server mode: the bridge as its own container, how the core starts
or reaches it, the listen address (ADR 0004), and the shared secret for the
bus (ADR 0046). Depends on `access-token-at-origin.md` for any exposure.
