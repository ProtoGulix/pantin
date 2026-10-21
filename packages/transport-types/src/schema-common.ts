// What every transport folder shares: plain shapes of data, no logic and no Zod, since the
// protocol imports the schemas (ADR 0064 point 3). Transports cannot import the protocol,
// so the signal shape is spelled out here as string literals.

export type SignalType = "bit" | "float" | "integer";
export type SignalDirection = "command" | "feedback";

/** What a transport needs to know of a signal to carry it. */
export interface SignalShape {
  type: SignalType;
  direction: SignalDirection;
}

export type TransportLanguage = "en" | "fr";

/** The labels of one transport in one language, typed after its schema by each folder. */
export interface TransportLabels<
  Setting extends string,
  Field extends string,
  Value extends string,
> {
  name: string;
  /** The settings of the module (port, unit id...). */
  settings: Readonly<Record<Setting, string>>;
  /** The transport-specific columns of a channel (zone, address...). */
  channelFields: Readonly<Record<Field, string>>;
  /** The words of enumerated settings and fields. */
  values: Readonly<Record<Value, string>>;
}
