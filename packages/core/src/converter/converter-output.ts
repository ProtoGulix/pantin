import { SourceNodeSchema } from "@pantin/protocol";
import { z } from "zod";
import { formatIssues } from "../domain/validation.ts";

// Output of `python -m pantin_step_converter` (ADR 0009 point 3). This is an
// internal process boundary, so the schema lives in the core, not in protocol.

// A plain file name inside the output directory: no separator, no "..".
const ComponentFileSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.glb$/);

const ConverterSuccessSchema = z.object({
  sourceUnit: z.string().min(1),
  components: z
    .array(
      z.object({ file: ComponentFileSchema, name: z.string(), nodes: z.array(SourceNodeSchema) }),
    )
    .min(1),
});
export type ConverterSuccess = z.infer<typeof ConverterSuccessSchema>;

const ConverterErrorSchema = z.object({ error: z.string().min(1) });

export type ProcessOutcome = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTooLarge: boolean;
};

// `clientMessage` goes to the API client; `logDetail` stays in the core logs.
export type ConverterVerdict =
  | { ok: true; output: ConverterSuccess }
  | { ok: false; clientMessage: string; logDetail: string };

const GENERIC_FAILURE = "The STEP converter failed on this file; the core logs have the details.";

function failure(logDetail: string, clientMessage = GENERIC_FAILURE): ConverterVerdict {
  return { ok: false, clientMessage, logDetail };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function describeRun(outcome: ProcessOutcome): string {
  const stderrTail = outcome.stderr.slice(-2000);
  return `exit code ${outcome.exitCode}, signal ${outcome.signal}, stderr: ${stderrTail}`;
}

export function interpretConverterRun(
  outcome: ProcessOutcome,
  timeLimitMs: number,
): ConverterVerdict {
  if (outcome.timedOut) {
    const seconds = Math.round(timeLimitMs / 1000);
    return failure(
      `STEP converter killed after ${timeLimitMs} ms. ${describeRun(outcome)}`,
      `The STEP conversion took longer than ${seconds} s and was stopped. Simplify or split the assembly.`,
    );
  }
  if (outcome.outputTooLarge) {
    return failure(`STEP converter output exceeded its size limit. ${describeRun(outcome)}`);
  }
  const json = parseJson(outcome.stdout);
  if (outcome.exitCode === 2) {
    const refusal = ConverterErrorSchema.safeParse(json);
    return refusal.success
      ? failure(
          `STEP converter refused the file: ${refusal.data.error}`,
          `The STEP file could not be converted: ${refusal.data.error}`,
        )
      : failure(`STEP converter exit 2 without a valid error object. ${describeRun(outcome)}`);
  }
  if (outcome.exitCode !== 0) {
    return failure(`STEP converter crashed. ${describeRun(outcome)}`);
  }
  const success = ConverterSuccessSchema.safeParse(json);
  if (!success.success) {
    return failure(
      `STEP converter output is invalid: ${formatIssues(success.error.issues)}. stdout starts with: ${outcome.stdout.slice(0, 500)}`,
    );
  }
  return { ok: true, output: success.data };
}
