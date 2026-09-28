# Clean orphan mesh files

A mesh imported and never saved stays in `meshes/` (ADR 0006) and also blocks
its body id. Idea: on open, list mesh files referenced by no body and offer to
delete them, never automatically.
