import { writeFile } from "node:fs/promises";
import type { GeneratedText } from "./folder-text.ts";

// The arguments of the commands that generate a text from a folder:
// `<folder> [--output <file>]`, in either order.

export type GenerateArguments = { folder: string; outputFile: string | undefined };

export function parseGenerateArguments(args: readonly string[]): GenerateArguments | undefined {
  const flagIndex = args.indexOf("--output");
  const outputFile = flagIndex === -1 ? undefined : args[flagIndex + 1];
  // A file name that looks like a flag is a forgotten value, not a name.
  if (flagIndex !== -1 && (outputFile === undefined || outputFile.startsWith("--"))) {
    return undefined;
  }
  const rest =
    flagIndex === -1
      ? args
      : args.filter((_arg, index) => index !== flagIndex && index !== flagIndex + 1);
  const [folder, ...extra] = rest;
  return folder === undefined || extra.length > 0 ? undefined : { folder, outputFile };
}

/** Writes the text as UTF-8 bytes, exactly: a shell redirection may re-encode it. */
export async function writeGeneratedFile(
  result: GeneratedText,
  outputFile: string,
): Promise<GeneratedText> {
  try {
    await writeFile(outputFile, result.text, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failure = `Cannot write ${outputFile}: ${reason}`;
    return { ...result, exitCode: 1, errors: [...result.errors, failure] };
  }
  return result;
}
