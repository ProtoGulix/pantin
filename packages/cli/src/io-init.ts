import type { LegacyIoModulesFile } from "@pantin/core";
import { deriveVariable, ioWidthOf } from "@pantin/core";
import type { IoType, IoZone, TagDirection, TagType } from "@pantin/protocol";

// What `pantin io init` writes (ADR 0045 point 9): pure functions from the tag
// list to rows, and the defaults of the first module.

export const INIT_MODULE_KEY = "m1";
const INIT_MODULE_PORT = 1502;

export const INIT_MODULES_FILE: LegacyIoModulesFile = {
  schema_version: 1,
  modules: [
    {
      key: INIT_MODULE_KEY,
      port: INIT_MODULE_PORT,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
    },
  ],
};

export type InitTag = { name: string; type: TagType; direction: TagDirection };

function zoneAndTypeOf(tag: InitTag): { zone: IoZone; ioType: IoType } {
  const command = tag.direction === "command";
  if (tag.type === "bit") {
    return { zone: command ? "coil" : "discrete_input", ioType: "BOOL" };
  }
  return {
    zone: command ? "holding_register" : "input_register",
    ioType: tag.type === "float" ? "REAL" : "DINT",
  };
}

// The first free address of each zone of the first module, past what is used.
export type NextAddresses = Map<IoZone, number>;

/** The rows (without line ends) mapping `tags` in module m1, from the next free addresses. */
export function initRows(tags: readonly InitTag[], used: NextAddresses = new Map()): string[] {
  const next = new Map(used);
  return tags.map((tag) => {
    const { zone, ioType } = zoneAndTypeOf(tag);
    const address = next.get(zone) ?? 0;
    next.set(zone, address + ioWidthOf(ioType));
    return [tag.name, deriveVariable(tag.name), INIT_MODULE_KEY, zone, address, ioType, ""].join(
      ";",
    );
  });
}
