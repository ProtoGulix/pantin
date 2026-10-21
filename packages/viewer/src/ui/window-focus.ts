// The window got the focus back: the user returns from an editor or a terminal, where a
// file of the Pantin may have changed (ADR 0063 point 5). Both events are listened to
// because browsers fire either one; the caller debounces.

export function listenToWindowFocus(onFocus: () => void): void {
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      onFocus();
    }
  });
}
