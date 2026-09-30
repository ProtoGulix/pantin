# Declarative drive types

A drive type described by data only (tags, parameters, a small set of motion
primitives such as "go to a limit at a speed" or "follow a setpoint with a
speed and acceleration limit"), with no code. Such a type could be loaded at
run time from a community folder without a sandbox, unlike the coded drive
types of ADR 0022. Worth an ADR once enough coded types show which
primitives they share.
