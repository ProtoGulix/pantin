import { networkInterfaces } from "node:os";

// Every address of the host's interfaces; the one place that asks the system,
// injected into the supervisor so its checks stay pure (ADR 0050 point 4).
export function listHostAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).map((entry) => entry.address),
  );
}
