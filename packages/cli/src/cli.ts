import { BRIDGE_LOG_USAGE, type BridgeLogEnvironment, bridgeLog } from "./bridge-log-command.ts";
import type { CommandResult } from "./command-result.ts";
import { generateGvl } from "./gvl.ts";
import { ioInit } from "./io-init-command.ts";
import { ioJsonSchemaText, pantinJsonSchemaText } from "./json-schema.ts";
import { realEnvironment } from "./real-environment.ts";
import { validatePantinFolder } from "./validate-folder.ts";

// The pantin command's logic, with its output streams injected so that tests
// read what it prints; main.ts runs it on the process.

const USAGE = [
  "Usage: pnpm pantin <command>",
  "  validate <folder>   check a Pantin folder: pantin.json and its mesh files",
  "  schema [io]         print the JSON Schema of pantin.json, or of io.json with io",
  "  io init <folder> [--update]",
  "                      write io.json, or with --update map the unmapped tags into m1",
  "  gvl <folder>        print the CODESYS global variable list of io.json",
  BRIDGE_LOG_USAGE,
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

function report(result: CommandResult, { stdout, stderr }: Streams): number {
  for (const message of result.messages) {
    writeLine(stdout, message);
  }
  for (const error of result.errors) {
    writeLine(stderr, `error: ${error}`);
  }
  return result.exitCode;
}

async function runIoInit(args: readonly string[], streams: Streams): Promise<number> {
  const folders = args.filter((arg) => arg !== "--update");
  const [folder] = folders;
  if (folder === undefined || folders.length > 1 || args.length - folders.length > 1) {
    writeLine(streams.stderr, USAGE);
    return 2;
  }
  return report(await ioInit(folder, args.includes("--update")), streams);
}

async function runGvl(folder: string, { stdout, stderr }: Streams): Promise<number> {
  const result = await generateGvl(folder);
  stdout.write(result.stdout);
  for (const error of result.errors) {
    writeLine(stderr, error);
  }
  return result.exitCode;
}

async function runBridgeLog(
  args: readonly string[],
  streams: Streams,
  environment: BridgeLogEnvironment,
): Promise<number> {
  const result = await bridgeLog(args, environment, (text) => streams.stdout.write(text));
  if (result === undefined) {
    writeLine(streams.stderr, USAGE);
    return 2;
  }
  return report(result, streams);
}

/** Runs one command; the answer is the exit code: 0 valid, 1 problems, 2 bad usage. */
export async function runCommand(
  args: readonly string[],
  streams: Streams,
  environment: BridgeLogEnvironment = realEnvironment(),
): Promise<number> {
  const [command, argument, ...extra] = args;
  if (command === "bridge-log") {
    return runBridgeLog(
      [argument, ...extra].filter((value) => value !== undefined),
      streams,
      environment,
    );
  }
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
  if (command === "schema" && argument === "io" && extra.length === 0) {
    streams.stdout.write(ioJsonSchemaText());
    return 0;
  }
  writeLine(streams.stderr, USAGE);
  return 2;
}
