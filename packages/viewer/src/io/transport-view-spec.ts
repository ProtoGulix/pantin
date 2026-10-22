import type { TransportConfig } from "@pantin/transport-types/schemas";

// What the I/O view needs to know of a transport beyond its labels (ADR 0064 point 14): which
// settings a module has, how each is edited, and which channel fields are columns.

export type SettingInput = "integer" | "choice" | "text";

export interface SettingSpec {
  name: string;
  input: SettingInput;
  // The values of a "choice" setting; their words are the transport's `values` labels.
  options?: readonly string[];
  // A setting that is not a plain field of the transport (the OPC UA user name sits in `auth`)
  // reads and writes itself.
  readFrom?: (transport: TransportConfig) => string;
  patchOf?: (text: string) => Record<string, unknown>;
  // A long value the user must read whole to check it (a namespace URI, a NodeId prefix).
  wide?: boolean;
}

export interface TransportViewSpec {
  // The settings that tell a PLC where the module is: they make up the heading subtitle.
  endpointSettings: readonly string[];
  // Edited in the module's form, apart from the key which every module has.
  settings: readonly SettingSpec[];
  channelFields: readonly string[];
  // The fields that say where a channel sits in its module, for the inspector (zone and address).
  placeFields: readonly string[];
  // The channel fields typed in place: the others are derived by the core from the tag.
  editableChannelFields: readonly string[];
  // The channel fields whose value can be long enough to wrap in its cell (an OPC UA NodeId).
  longChannelFields?: readonly string[];
  // The label key of a channel field value when the raw value is not its own words
  // (the OPC UA identifier: null reads "derived", a NodeId reads "explicit").
  channelValueKey?: (field: string, value: unknown) => string | undefined;
}
