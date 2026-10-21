import { BRIDGE_LOG_USAGE, type BridgeLogEnvironment, bridgeLog } from "./bridge-log-command.ts";
import type { CommandResult } from "./command-result.ts";
import type { GeneratedText } from "./folder-text.ts";
import { parseGenerateArguments, writeGeneratedFile } from "./generated-output.ts";
import { generateGvl } from "./gvl.ts";
import { exportIoCsv } from "./io-export.ts";
import { parseIoInitArguments } from "./io-init-arguments.ts";
import { ioInit } from "./io-init-command.ts";
import { ioJsonSchemaText, pantinJsonSchemaText } from "./json-schema.ts";
import { realEnvironment } from "./real-environment.ts";
import { parseSignalsArguments, signalsCommand } from "./signals-command.ts";
import { validatePantinFolder } from "./validate-folder.ts";

// The pantin command's logic, with its output streams injected so that tests
// read what it prints; main.ts runs it on the process.

const USAGE = [
  "Usage: pnpm pantin <command>",
  "  validate <folder>   check a Pantin folder: pantin.json and its mesh files",
  "  schema [io]         print the JSON Schema of pantin.json, or of io.json with io",
  "  io init <folder> [--update] [--transport <kind>]",
  "                      write io.json (transport modbus_tcp_slave by default), or with --update",
  "                      map the unmapped tags into m1",
  "  io export <folder> [--output <file>]",
  "                      print the I/O mapping as CSV, one row per channel (read-only)",
  "  gvl <folder> [--output <file>]",
  "                      print the CODESYS global variable list of io.json",
  "  signals <folder> [--json]",
  "                      print the signals (tags with type, direction, unit, owner), read-only",
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

async function runSignals(args: readonly string[], streams: Streams): Promise<number> {
  const parsed = parseSignalsArguments(args);
  if (parsed === undefined) {
    writeLine(streams.stderr, USAGE);
    return 2;
  }
  return report(await signalsCommand(parsed.folder, parsed.json), streams);
}

async function runIoInit(args: readonly string[], streams: Streams): Promise<number> {
  const parsed = parseIoInitArguments(args);
  if (parsed === undefined) {
    writeLine(streams.stderr, USAGE);
    return 2;
  }
  if (typeof parsed === "string") {
    writeLine(streams.stderr, `error: ${parsed}`);
    return 2;
  }
  return report(await ioInit(parsed.folder, parsed.update, parsed.transport), streams);
}

// With --output the bytes go straight to the file: a shell redirection can
// re-encode them (Windows PowerShell 5.1, NOT VERIFIED), which would damage the BOM.
async function runGenerated(
  args: readonly string[],
  generate: (folder: string) => Promise<GeneratedText>,
  { stdout, stderr }: Streams,
): Promise<number> {
  const parsed = parseGenerateArguments(args);
  if (parsed === undefined) {
    writeLine(stderr, USAGE);
    return 2;
  }
  const generated = await generate(parsed.folder);
  const result =
    parsed.outputFile !== undefined && generated.exitCode === 0
      ? await writeGeneratedFile(generated, parsed.outputFile)
      : generated;
  if (parsed.outputFile === undefined) {
    stdout.write(result.text);
  }
  for (const error of result.errors) {
    writeLine(stderr, error);
  }
  return result.exitCode;
}

async function runIo(args: readonly string[], streams: Streams): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand === "init") {
    return runIoInit(rest, streams);
  }
  if (subcommand === "export") {
    return runGenerated(rest, exportIoCsv, streams);
  }
  writeLine(streams.stderr, USAGE);
  return 2;
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
  if (command === "gvl") {
    return runGenerated(args.slice(1), generateGvl, streams);
  }
  if (command === "signals") {
    return runSignals(args.slice(1), streams);
  }
  if (command === "io") {
    return runIo(args.slice(1), streams);
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
