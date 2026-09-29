# Part instances, interface frames and joints between instances

A part could declare a root body and named interface frames (for example
"base" and "carriage"), and a scene could join interfaces of two instances
("instance.interface"): a cylinder bolted on a frame, a plate on a carriage.
It needs part instances, which do not exist yet (ADR 0002, ADR 0012), and
changes the public schema, so it needs an ADR and a schema_version increment
when its phase comes. Until then a group is a branch of the joint tree
(ADR 0017).
