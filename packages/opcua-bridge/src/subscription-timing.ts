// How the subscription of a module is sized from its watchdog (ADR 0065 point 6). Pure.

/**
 * The keep-alive count that makes a healthy server answer at least 3 times per watchdog
 * window, at the publishing interval the server revised (it may be longer than ours).
 */
export function keepAliveCountFor(
  watchdogMilliseconds: number,
  revisedPublishingMilliseconds: number,
): number {
  return Math.max(1, Math.floor(watchdogMilliseconds / (3 * revisedPublishingMilliseconds)));
}

/** The OPC UA minimum: a lifetime of at least 3 keep-alives. */
export function lifetimeCountFor(keepAliveCount: number): number {
  return 3 * keepAliveCount;
}
