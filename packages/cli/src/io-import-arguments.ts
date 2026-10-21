// The arguments of
// `pantin io import-symbols <folder> <file> [--format <id>] [--apply] [--accept-warnings]`
// (ADR 0064 point 13).

export type ImportSymbolsArguments = {
  folder: string;
  file: string;
  format?: string;
  apply: boolean;
  acceptWarnings: boolean;
};

/** The arguments, a sentence for a combination that makes no sense, or undefined for bad usage. */
export function parseImportSymbolsArguments(
  args: readonly string[],
): ImportSymbolsArguments | string | undefined {
  const positional: string[] = [];
  let format: string | undefined;
  let apply = false;
  let acceptWarnings = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply" && !apply) {
      apply = true;
    } else if (argument === "--accept-warnings" && !acceptWarnings) {
      acceptWarnings = true;
    } else if (argument === "--format" && format === undefined) {
      index += 1;
      format = args[index];
      if (format === undefined) {
        return undefined;
      }
    } else if (argument !== undefined && !argument.startsWith("--")) {
      positional.push(argument);
    } else {
      return undefined;
    }
  }
  const [folder, file, ...extra] = positional;
  if (folder === undefined || file === undefined || extra.length > 0) {
    return undefined;
  }
  if (acceptWarnings && !apply) {
    return "--accept-warnings only means something with --apply: without it nothing is written.";
  }
  return { folder, file, apply, acceptWarnings, ...(format === undefined ? {} : { format }) };
}
