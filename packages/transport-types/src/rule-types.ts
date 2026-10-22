import type { SignalShape } from "./schema-common.ts";
import type {
  ChannelMappedFields,
  ChannelPatchTransportFields,
  ChannelTransportFields,
  TransportChannel,
  TransportConfig,
  TransportKind,
  TransportPatch,
  TransportProblemCode,
  TransportSymbolWarningCode,
} from "./schemas.ts";

// The contract of a transport's rules (ADR 0064 point 3): what the core asks of a
// transport, whatever its protocol. Each folder's rules.ts exports one object of
// this type and rules.ts lists them. The core never names a kind.

export interface RuleModule {
  key: string;
  transport: TransportConfig;
  channels: readonly TransportChannel[];
}

/** A problem of one module: the path starts inside the module, for example ["channels", 2, "address"]. */
export interface TransportProblem {
  path: (string | number)[];
  code: TransportProblemCode;
  message: string;
}

/**
 * A remark about a channel wired to a PLC variable: a code the client translates, the
 * strings the English sentence interpolates, and that sentence for logs and the CLI.
 */
export interface TransportSymbolWarning {
  code: TransportSymbolWarningCode;
  values: Record<string, string>;
  message: string;
}

/** What a transport needs to know of a PLC variable to judge a channel wired to it. */
export interface SymbolShape {
  iecType: string;
  access: "read" | "write" | "read_write" | "unknown";
}

/** The transport fields of a new channel, or the sentence that says why there is no room. */
export type ChannelProposal = { fields: ChannelTransportFields } | { refusal: string };

/** What a bridge needs to know of one module it serves (ADR 0065 point 4). */
export interface BridgeModuleFacts {
  key: string;
  /** The port the bridge listens on for this module; null when it only connects out. */
  port: number | null;
}

export interface TransportRules {
  kind: TransportKind;
  /**
   * Whether the bridge of this transport listens for the PLC's connections or connects to
   * the PLC (ADR 0065 point 4): port claims apply to "listens" only.
   */
  network: "listens" | "connects";
  /** The modules of this transport among `modules`: the ones its bridge serves. */
  bridgeModules(modules: readonly RuleModule[]): BridgeModuleFacts[];
  /**
   * The name of the PLC global variable list the variables without a dot live in; null
   * for a transport that does not say (ADR 0065 point 3).
   */
  variableScope(transport: TransportConfig): string | null;
  /** What the core adds to the channel's sub-object in its answer, for example a resolved NodeId. */
  resolvedChannelFields(transport: TransportConfig, channel: TransportChannel): ChannelMappedFields;
  /** False for a (type, direction) pair the transport cannot carry. */
  supportsSignal(signal: SignalShape): boolean;
  /** The port the module listens on; null for a transport that does not listen. */
  listenPort(transport: TransportConfig): number | null;
  /** A new module's settings: the request's, completed. `usedPorts` are those of all modules. */
  createTransport(patch: TransportPatch, usedPorts: readonly number[]): TransportConfig | string;
  /** The settings after an edit of the same kind. */
  patchTransport(transport: TransportConfig, patch: TransportPatch): TransportConfig;
  /** The settings with their keys in canonical order. */
  orderedTransport(transport: TransportConfig): TransportConfig;
  /** The transport fields of a channel added to `module` for `signal`. */
  proposeChannel(module: RuleModule, signal: SignalShape): ChannelProposal;
  /**
   * The transport fields of `channel` once its signal or module changed. `module` is the
   * target without the channel; `moved` is true when the target is another module.
   */
  reshapeChannel(
    module: RuleModule,
    channel: TransportChannel,
    signal: SignalShape,
    moved: boolean,
  ): ChannelProposal;
  /**
   * The transport fields of `channel` after a hand edit. It returns only this transport's
   * sub-object: the core spreads the result into the edited channel and relies on it.
   */
  patchChannel(
    channel: TransportChannel,
    patch: ChannelPatchTransportFields,
  ): ChannelTransportFields;
  /** The transport fields with their keys in canonical order. */
  orderedChannelFields(channel: TransportChannel): ChannelTransportFields;
  /** The order of the channels in the canonical text of a module. */
  compareChannels(first: TransportChannel, second: TransportChannel): number;
  /**
   * Warnings (code, values and an English sentence) about wiring `channel` to a PLC variable of this shape
   * (ADR 0064 point 12). The type table every transport shares is the core's; this adds
   * what the protocol knows, for example that its wire type differs from the variable's.
   */
  symbolWarnings(
    channel: TransportChannel,
    symbol: SymbolShape,
    signal: SignalShape,
  ): TransportSymbolWarning[];
  /** The rules of the transport, against the signals of the document. */
  validateModule(module: RuleModule, signals: ReadonlyMap<string, SignalShape>): TransportProblem[];
}
