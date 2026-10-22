import { parseArgs } from "node:util";
import { classifyOutgoingTarget } from "@pantin/network-address";
import { KeySchema, PantinIdSchema } from "@pantin/protocol";
import { type CoreEndpoint, parseCoreEndpoint } from "./core-endpoint.ts";
import { ConfigurationError } from "./errors.ts";

// The command line the core builds (ADR 0065 point 5, packages/core/src/bridge/opcua-launcher.ts):
//   --status-lines --core <url> --pantin <id> --pki-dir <dir> --target <module>=<ip>...
//   [--trust <sha256>]...

export type BridgeArguments = {
  statusLines: boolean;
  core: CoreEndpoint;
  pkiDirectory: string;
  /** Module key to the normalised address of its PLC. */
  targets: ReadonlyMap<string, string>;
  /** Lower case SHA-256 thumbprints of the server certificates the user trusts. */
  trust: readonly string[];
};

const OPTIONS = {
  "status-lines": { type: "boolean" },
  core: { type: "string" },
  pantin: { type: "string" },
  "pki-dir": { type: "string" },
  target: { type: "string", multiple: true },
  trust: { type: "string", multiple: true },
} as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function requiredOption(value: string | undefined, name: string): string {
  if (value === undefined || value === "") {
    throw new ConfigurationError(`--${name} is required.`);
  }
  return value;
}

// The bridge checks every target again, whatever the core did (ADR 0065 point 8): the core
// knows the scope the user chose, the bridge accepts the addresses either scope would accept.
function acceptedTarget(text: string): { address: string } | { refusal: string } {
  const local = classifyOutgoingTarget(text, "local");
  if (local.accepted) {
    return { address: local.address };
  }
  const lan = classifyOutgoingTarget(text, "lan");
  if (lan.accepted) {
    return { address: lan.address };
  }
  return { refusal: local.reason === "loopback_other_than_standard" ? local.message : lan.message };
}

function parseTarget(entry: string): { key: string; address: string } {
  const separator = entry.indexOf("=");
  const key = KeySchema.safeParse(entry.slice(0, separator));
  if (separator < 1 || !key.success) {
    throw new ConfigurationError(
      `--target "${entry}" must be <module>=<ip address>, for example m1=192.168.1.10.`,
    );
  }
  const accepted = acceptedTarget(entry.slice(separator + 1));
  if ("refusal" in accepted) {
    throw new ConfigurationError(`--target for module ${key.data}: ${accepted.refusal}`);
  }
  return { key: key.data, address: accepted.address };
}

function parseTargets(entries: readonly string[]): Map<string, string> {
  const targets = new Map<string, string>();
  for (const entry of entries) {
    const { key, address } = parseTarget(entry);
    if (targets.has(key)) {
      throw new ConfigurationError(`--target names module ${key} twice.`);
    }
    targets.set(key, address);
  }
  return targets;
}

function parseTrust(entries: readonly string[]): string[] {
  return entries.map((entry) => {
    if (!SHA256_PATTERN.test(entry)) {
      throw new ConfigurationError(
        `--trust "${entry}" must be 64 hexadecimal characters (SHA-256).`,
      );
    }
    return entry.toLowerCase();
  });
}

function parsePantinId(text: string): string {
  const parsed = PantinIdSchema.safeParse(text);
  if (!parsed.success) {
    throw new ConfigurationError(`--pantin "${text}" is not a Pantin id.`);
  }
  return parsed.data;
}

function readOptions(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false })
      .values;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`Bad command line: ${reason}`);
  }
}

export function parseArguments(argv: readonly string[]): BridgeArguments {
  const values = readOptions(argv);
  const pantinId = parsePantinId(requiredOption(values.pantin, "pantin"));
  return {
    statusLines: values["status-lines"] === true,
    core: parseCoreEndpoint(requiredOption(values.core, "core"), pantinId),
    pkiDirectory: requiredOption(values["pki-dir"], "pki-dir"),
    targets: parseTargets(values.target ?? []),
    trust: parseTrust(values.trust ?? []),
  };
}
