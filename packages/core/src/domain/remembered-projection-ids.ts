import type { PantinDocument, TransportKind } from "@pantin/protocol";
import type { IoReading } from "./io-document-text.ts";

// The ids of an open Pantin's transport projections, valid while its mapping and its
// document are the very objects named here: an edit replaces both (service/io-projection-ids.ts).
export type RememberedProjectionIds = {
  io: IoReading;
  document: PantinDocument;
  byTransport: Map<TransportKind, string | null>;
};
