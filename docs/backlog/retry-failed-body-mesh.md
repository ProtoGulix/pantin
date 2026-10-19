# Retry a body whose mesh failed to load

Phase: 8. ADR: none.

Since 2026-10-13 a body whose mesh fails to load keeps its load key, so the
viewer shows the error once instead of reloading at every redraw. A passing
failure (core restarted mid-download, network error) then leaves the body
empty until its key changes, the user opens another Pantin or reloads the
page. A "Réessayer" action on the error message would cover it.
