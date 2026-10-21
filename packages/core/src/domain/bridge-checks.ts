import type { IoStatus, TransportConfig, TransportKind } from "@pantin/protocol";
import type { BridgeModuleFacts, TransportRules } from "@pantin/transport-types/rules";

// The checks every bridge start goes through, whatever the transport (ADR 0050 point 4,
// ADR 0065 point 5): the mapping, the slot of the (Pantin, kind) and the cap. Pure: the
// mapping and the other bridges come in as data. What only one kind needs (the Modbus
// listen address, say) is in that kind's own file.

export const MAX_SUPERVISED_BRIDGES = 4;

// 400 for a request that can never work, 409 for one that conflicts with the current
// state of the core, 503-like `bridge_unavailable` when the core has no program for it.
// `httpStatus` overrides the status of the code, for the 403 of the Cloudflare exposure.
export type BridgeRefusal = {
  code: "invalid_request" | "conflict" | "bridge_unavailable";
  message: string;
  httpStatus?: number;
};

// What a bridge that is starting, running or stopping holds. `listen` and `ports` are
// empty for a kind that connects out: port claims apply to "listens" kinds only.
export type SupervisedBridgeClaim = {
  pantinId: string;
  kind: TransportKind;
  listen: string | null;
  ports: readonly number[];
};

export type BridgeSharedFacts = {
  kind: TransportKind;
  // The kind's name for messages, for example "Modbus TCP slave".
  transportName: string;
  mapping: {
    status: IoStatus;
    // The modules of this kind only (`bridgeModules` of its rules): the bridge serves no other.
    modules: readonly BridgeModuleFacts[];
    // The first problems, already worded.
    problems: readonly string[];
  };
  // True when a bridge of this kind holds the `plc` slot and Pantin did not start it.
  externalBridgeConnected: boolean;
  // The bridges that are starting, running or stopping, of every Pantin and every kind.
  activeBridges: readonly SupervisedBridgeClaim[];
};

// Everything the start of one bridge is judged on, gathered by the supervisor.
export type BridgeStartFacts = BridgeSharedFacts & {
  // Every address of the host's interfaces, as `os.networkInterfaces()` gives them.
  hostAddresses: readonly string[];
  // Where the core itself listens.
  core: { host: string; port: number };
  // The settings of the modules the bridge serves (the same keys as `mapping.modules`).
  moduleTransports: readonly { key: string; transport: TransportConfig }[];
  // The passwords the core holds in memory for this Pantin, by module key (ADR 0065 point 9).
  storedPasswords: Readonly<Record<string, string>>;
};

export function refusal(code: BridgeRefusal["code"], message: string): BridgeRefusal {
  return { code, message };
}

export function checkMapping(facts: BridgeSharedFacts): BridgeRefusal | undefined {
  const { mapping, transportName } = facts;
  if (mapping.status === "valid") {
    return mapping.modules.length > 0
      ? undefined
      : refusal(
          "conflict",
          `io.json has no ${transportName} module, and this bridge serves only those. Add one in the I/O view before starting the bridge.`,
        );
  }
  const detail =
    mapping.status === "missing"
      ? "This Pantin has no io.json yet."
      : `The I/O mapping is invalid: ${mapping.problems.join("; ")}.`;
  return refusal("conflict", `${detail} Fix it before starting the bridge.`);
}

export function checkSlot(pantinId: string, facts: BridgeSharedFacts): BridgeRefusal | undefined {
  const isHeld = facts.activeBridges.some(
    (claim) => claim.pantinId === pantinId && claim.kind === facts.kind,
  );
  if (isHeld) {
    return refusal(
      "conflict",
      `This Pantin's ${facts.transportName} bridge is already running or starting.`,
    );
  }
  return facts.externalBridgeConnected
    ? refusal(
        "conflict",
        "A bridge started outside Pantin is connected to this Pantin: stop it first.",
      )
    : undefined;
}

export function checkCap(activeCount: number): BridgeRefusal | undefined {
  return activeCount >= MAX_SUPERVISED_BRIDGES
    ? refusal(
        "conflict",
        `The core already supervises ${MAX_SUPERVISED_BRIDGES} bridges. Stop one first.`,
      )
    : undefined;
}

// Only a bridge that listens holds ports; one that connects out claims none, whatever its
// modules say (ADR 0065 point 5).
export function claimedPorts(
  network: TransportRules["network"],
  modules: readonly BridgeModuleFacts[],
): number[] {
  return network === "listens" ? modules.flatMap(({ port }) => (port === null ? [] : [port])) : [];
}
