# STEP converter robustness

Non-blocking reviewer findings on the STEP import (ADR 0009), 2026-09-28:

1. Rollback in `packages/core/src/service/import-operations.ts`: use
   `Promise.allSettled` for mesh deletions, report delete failures, rethrow
   the original error, and also delete a mesh whose write failed half way
   (but never a file that already existed: EEXIST).
2. `packages/core/src/converter/process-runner.ts` resolves on `close`: a
   grandchild keeping the pipes open would keep an import pending after the
   converter is killed. Spawn detached and kill the process group, or resolve
   on `exit` and destroy the streams after the grace period.
3. Caps on component count and converted GLB size before server mode.
