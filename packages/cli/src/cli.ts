import { pantinJsonSchemaText } from "./json-schema.ts";
import { validatePantinFolder } from "./validate-folder.ts";

// The pantin command's logic, with its output streams injected so that tests
// read what it prints; main.ts runs it on the process.

const USAGE = [
  "Usage: pnpm pantin <command>",
  "  validate <folder>   check a Pantin folder: pantin.json and its mesh files",
  "  schema              print the JSON Schema of pantin.json",
].join("\n");

export interface Output {
  write(text: string): void;
}

export interface Streams {
  stdout: Output;
  stderr: Output;
}

function writeLine(stream: Output, text: string): void {
  stream.write(`${text}\n`);
}

async function validate(folder: string, { stdout, stderr }: Streams): Promise<number> {
  const { problems, notes } = await validatePantinFolder(folder);
  for (const note of notes) {
    writeLine(stdout, `note: ${note}`);
  }
  for (const problem of problems) {
    writeLine(stderr, `error: ${problem}`);
  }
  if (problems.length === 0) {
    writeLine(stdout, `${folder}: valid Pantin.`);
  }
  return problems.length === 0 ? 0 : 1;
}

/** Runs one command; the answer is the exit code: 0 valid, 1 problems, 2 bad usage. */
export async function runCommand(args: readonly string[], streams: Streams): Promise<number> {
  const [command, argument, ...extra] = args;
  if (command === "validate" && argument !== undefined && extra.length === 0) {
    return validate(argument, streams);
  }
  if (command === "schema" && argument === undefined) {
    streams.stdout.write(pantinJsonSchemaText());
    return 0;
  }
  writeLine(streams.stderr, USAGE);
  return 2;
}
