import { allocateVariable, proposeAddress, zoneAndTypeOf } from "@pantin/core";
import {
  type IoChannel,
  type IoDocument,
  IoDocumentSchema,
  type TagDirection,
  type TagType,
} from "@pantin/protocol";

// What `pantin io init` computes (ADR 0049 point 9): pure functions from the
// tag list to channels of the first module. Zone, type, address and variable
// all come from the core's allocation functions (ADR 0049 point 4), so that
// the command line and the editor allocate the same way.

export const INIT_MODULE_KEY = "m1";
const INIT_MODULE_PORT = 1502;

export type InitTag = { name: string; type: TagType; direction: TagDirection };

/** A mapping with module m1 on port 1502 and no channel; the schema supplies the other defaults. */
export function freshIoDocument(): IoDocument {
  return IoDocumentSchema.parse({
    schema_version: 1,
    modules: [{ key: INIT_MODULE_KEY, port: INIT_MODULE_PORT, channels: [] }],
  });
}

/** The document with `tags` mapped into module m1, in order; a sentence when it cannot. */
export function mapTagsIntoFirstModule(
  document: IoDocument,
  tags: readonly InitTag[],
): IoDocument | string {
  const target = document.modules.find((module) => module.key === INIT_MODULE_KEY);
  if (target === undefined) {
    return `io.json has no module "${INIT_MODULE_KEY}", where new channels go: add it first.`;
  }
  const variables = document.modules.flatMap((module) =>
    module.channels.map((channel) => channel.variable),
  );
  const channels: IoChannel[] = [...target.channels];
  for (const tag of tags) {
    const { zone, ioType } = zoneAndTypeOf(tag.type, tag.direction);
    const address = proposeAddress(channels, zone, ioType);
    if (address === null) {
      return `Zone ${zone} of module "${INIT_MODULE_KEY}" is full: cannot map ${tag.name}.`;
    }
    const variable = allocateVariable(tag.name, variables);
    variables.push(variable);
    channels.push({ tag: tag.name, variable, zone, address, ioType, comment: "" });
  }
  return {
    ...document,
    modules: document.modules.map((module) =>
      module === target ? { ...target, channels } : module,
    ),
  };
}
