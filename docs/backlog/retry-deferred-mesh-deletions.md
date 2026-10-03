# Retry failed deferred mesh deletions

The orphan cleanup command itself is done (ADR 0038). What remains: a
deferred mesh deletion is retried only once. `deletePendingMeshes` drops the
path from the pending set before `deleteMesh`, so a failure (a read-only
file) makes that save request report an error although `pantin.json` was
written, then leaves an orphan that is never retried. The orphan cleanup
recovers the file and reports the I/O cause; fixing the save's error
contract is a separate change.
