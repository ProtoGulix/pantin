import { TRANSPORT_KINDS, type TransportKind, TransportKindSchema } from "@pantin/protocol";

// The arguments of `pantin io init <folder> [--update] [--transport <kind>]` (ADR 0064 point 6).

export type IoInitArguments = { folder: string; update: boolean; transport?: TransportKind };

/** The arguments, a sentence when `--transport` names no known kind, or undefined for bad usage. */
export function parseIoInitArguments(
  args: readonly string[],
): IoInitArguments | string | undefined {
  let folder: string | undefined;
  let update = false;
  let transportName: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--update" && !update) {
      update = true;
    } else if (argument === "--transport" && transportName === undefined) {
      index += 1;
      transportName = args[index];
      if (transportName === undefined) {
        return undefined;
      }
    } else if (argument !== undefined && !argument.startsWith("--") && folder === undefined) {
      folder = argument;
    } else {
      return undefined;
    }
  }
  if (folder === undefined) {
    return undefined;
  }
  if (transportName === undefined) {
    return { folder, update };
  }
  const transport = TransportKindSchema.safeParse(transportName);
  return transport.success
    ? { folder, update, transport: transport.data }
    : `Unknown transport "${transportName}": the known ones are ${TRANSPORT_KINDS.join(", ")}.`;
}
