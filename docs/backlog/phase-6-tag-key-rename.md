# Tag key rename for emitters and presence sensors

Drives and joint sensors have `PUT .../tag-key` (RenameTagKeyRequest, answering
the renamed tags). Emitters and presence sensors (ADR 0043) have no such route:
their tag key is derived from the name at creation and cannot change afterwards.
Add the same route and the domain function (as `renameDriveTagKey`) once the
viewer inspector needs it; the PLC variable names depend on it.
