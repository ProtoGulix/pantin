# Tag key rename for emitters and presence sensors

Phase: 8 (editing). ADR: 0043, 0049.

## Why

Drives, joints and joint sensors have `PUT .../tag-key`. Emitters and presence
sensors have no such route: their tag key is derived from the name at creation
and cannot change afterwards, yet the PLC variable names depend on it.

## What

Add the route (`core/src/http/conveyor-routes.ts`) and the domain function, as
`renameDriveTagKey` does, once the inspector needs it. io.json follows the
renamed tags (ADR 0049).
