import { ApiError, addChannels, addModule, type IoTag } from "@pantin/core";
import type { IoDocument, TransportKind } from "@pantin/protocol";

// What `pantin io init` computes (ADR 0049 point 9, ADR 0064 point 6): pure
// functions from the tag list to channels of the first module. Allocation is
// the core's edit code (ADR 0049 point 4), so that the command line and the
// editor allocate the same way, and the transport's rules decide the rest.

export const INIT_MODULE_KEY = "m1";
export const DEFAULT_INIT_TRANSPORT: TransportKind = "modbus_tcp_slave";

/** A mapping with module m1 on the given transport, no channel, and the transport's defaults. */
export function freshIoDocument(kind: TransportKind): IoDocument {
  return addModule(null, { transport: { kind } });
}

/** The document with `tags` mapped into module m1, in order; a sentence when it cannot. */
export function mapTagsIntoFirstModule(
  document: IoDocument,
  tags: readonly IoTag[],
): IoDocument | string {
  if (!document.modules.some((module) => module.key === INIT_MODULE_KEY)) {
    return `io.json has no module "${INIT_MODULE_KEY}", where new channels go: add it first.`;
  }
  try {
    return addChannels(
      document,
      INIT_MODULE_KEY,
      tags.map((tag) => tag.name),
      tags,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return error.message;
    }
    throw error;
  }
}
