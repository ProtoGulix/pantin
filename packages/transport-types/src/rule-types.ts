import type { SignalShape } from "./schema-common.ts";
import type {
  ChannelPatchTransportFields,
  ChannelTransportFields,
  TransportChannel,
  TransportConfig,
  TransportKind,
  TransportPatch,
  TransportProblemCode,
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

/** The transport fields of a new channel, or the sentence that says why there is no room. */
export type ChannelProposal = { fields: ChannelTransportFields } | { refusal: string };

export interface TransportRules {
  kind: TransportKind;
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
  /** The rules of the transport, against the signals of the document. */
  validateModule(module: RuleModule, signals: ReadonlyMap<string, SignalShape>): TransportProblem[];
}
