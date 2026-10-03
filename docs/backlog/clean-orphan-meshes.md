# Clean orphan mesh files

A mesh imported and never saved stays in `meshes/` (ADR 0006) and also blocks
its body id. Idea: on open, list mesh files referenced by no body and offer to
delete them, never automatically.

Related, found while reviewing ADR 0037 I1: a deferred mesh deletion is
retried only once. `deletePendingMeshes` drops the path from the pending set
before `deleteMesh`, so a second failure (a read-only file) makes that save
report an error, then leaves an orphan that is never retried. The I/O cause
of a failed release is also not recorded anywhere (console codes are a
closed protocol list).
