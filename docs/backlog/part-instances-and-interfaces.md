# Part instances, interface frames and joints between instances

A part could declare a root body and named interface frames (for example
"base" and "carriage"), and a scene could join interfaces of two instances
("instance.interface"): a cylinder bolted on a frame, a plate on a carriage.
It needs part instances, which do not exist yet (ADR 0002, ADR 0012), and
changes the public schema, so it needs an ADR and a schema_version increment
when its phase comes. Until then a group is a branch of the joint tree
(ADR 0017).

## Rules for phase 9

Two rules to settle in that ADR, taken from the phase 6 objects (ADR 0043,
ADR 0047):

- Emitters and absorbers belong to the scene, not to a part. They are
  machine-level: where products appear and disappear depends on the line, not
  on the part. A part therefore never carries one, and an instance never
  duplicates one.
- A belt's `drumJoint` must be inside the part. The joint, its drive chain and
  the belt then travel together, and a part never refers to a joint outside
  itself. Today's document rule only asks for a continuous joint of the Pantin
  (`packages/protocol/src/pantin-conveyors.ts`, `drumIssues`).
