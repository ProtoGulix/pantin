# Detect external edits of pantin.json

Once loaded, a Pantin stays in the core's memory (ADR 0006): an edit made
outside Pantin (text editor, git pull) is ignored until the core restarts.
Idea: compare the file's modification time or content hash on access, and
report a conflict when both the file and the in-memory document changed.
