import { generateGvl } from "./gvl.ts";
import { ioInit } from "./io-init-command.ts";
import { pantinJsonSchemaText } from "./json-schema.ts";
import { validatePantinFolder } from "./validate-folder.ts";

// The pantin command's logic, with its output streams injected so that tests
// read what it prints; main.ts runs it on the process.

const USAGE = [
  "Usage: pnpm pantin <command>",
  "  validate <folder>   check a Pantin folder: pantin.json and its mesh files",
  "  schema              print the JSON Schema of pantin.json",
  "  io init <folder> [--update]",
  "                      write io.csv and io-modules.json, or append the unmapped tags",
  "  gvl <folder>        print the CODESYS global variable list of io.csv",
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

async function runIoInit(args: readonly string[], { stdout, stderr }: Streams): Promise<number> {
  const folders = args.filter((arg) => arg !== "--update");
  const [folder] = folders;
  if (folder === undefined || folders.length > 1 || args.length - folders.length > 1) {
    writeLine(stderr, USAGE);
    return 2;
  }
  const result = await ioInit(folder, args.includes("--update"));
  for (const message of result.messages) {
    writeLine(stdout, message);
  }
  for (const error of result.errors) {
    writeLine(stderr, `error: ${error}`);
  }
  return result.exitCode;
}

async function runGvl(folder: string, { stdout, stderr }: Streams): Promise<number> {
  const result = await generateGvl(folder);
  stdout.write(result.stdout);
  for (const error of result.errors) {
    writeLine(stderr, error);
  }
  return result.exitCode;
}

/** Runs one command; the answer is the exit code: 0 valid, 1 problems, 2 bad usage. */
export async function runCommand(args: readonly string[], streams: Streams): Promise<number> {
  const [command, argument, ...extra] = args;
  if (command === "validate" && argument !== undefined && extra.length === 0) {
    return validate(argument, streams);
  }
  if (command === "gvl" && argument !== undefined && extra.length === 0) {
    return runGvl(argument, streams);
  }
  if (command === "io" && argument === "init") {
    return runIoInit(extra, streams);
  }
  if (command === "schema" && argument === undefined) {
    streams.stdout.write(pantinJsonSchemaText());
    return 0;
  }
  writeLine(streams.stderr, USAGE);
  return 2;
}
