// Auto-scroll of the console (ADR 0031 point 5): a new line scrolls the list
// down only when the user was already at the bottom, so reading older lines is
// never interrupted.

// Sub-pixel scroll positions of a zoomed page are never exactly at the end.
const BOTTOM_TOLERANCE_PIXELS = 4;

export function isScrolledToBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_TOLERANCE_PIXELS;
}
