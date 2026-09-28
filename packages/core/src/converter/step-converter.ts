import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasGlbHeader } from "../domain/glb.ts";
import type { ConvertedComponent } from "../domain/step-bodies.ts";
import { ApiError } from "../errors.ts";
import { type ConverterSuccess, interpretConverterRun } from "./converter-output.ts";
import { type ProcessLimits, type ProcessSpawner, runProcess } from "./process-runner.ts";

// Runs the Python STEP converter (ADR 0009) in a child process: a crash or a
// hang of OpenCascade cannot take the core down. Not a sandbox.

type ConvertedMesh = ConvertedComponent & { glbBytes: Uint8Array };

export type StepConverter = (stepBytes: Uint8Array) => Promise<ConvertedMesh[]>;

export type StepConverterOptions = {
  pythonPath: string;
  spawn: ProcessSpawner;
  reportDetail: (detail: string) => void;
  limits?: Partial<ProcessLimits>;
};

const DEFAULT_LIMITS: ProcessLimits = {
  timeLimitMs: 120_000,
  killGraceMs: 2_000,
  maxOutputBytes: 1024 * 1024,
};

function conversionFailed(message: string): ApiError {
  return new ApiError("conversion_failed", message);
}

async function readComponentGlb(outputDirectory: string, fileName: string): Promise<Uint8Array> {
  const path = join(outputDirectory, fileName);
  // lstat: a symbolic link planted by the converter is never followed.
  const stats = await lstat(path).catch(() => undefined);
  if (stats === undefined || !stats.isFile()) {
    throw conversionFailed(
      `The STEP converter did not produce "${fileName}". Check the core logs.`,
    );
  }
  const bytes = new Uint8Array(await readFile(path));
  if (!hasGlbHeader(bytes)) {
    throw conversionFailed(`The STEP converter produced "${fileName}", which is not a GLB file.`);
  }
  return bytes;
}

async function readComponents(
  outputDirectory: string,
  output: ConverterSuccess,
): Promise<ConvertedMesh[]> {
  const meshes: ConvertedMesh[] = [];
  for (const component of output.components) {
    const glbBytes = await readComponentGlb(outputDirectory, component.file);
    meshes.push({ name: component.name, nodes: component.nodes, glbBytes });
  }
  return meshes;
}

async function runConversion(
  options: StepConverterOptions,
  limits: ProcessLimits,
  workDirectory: string,
): Promise<ConvertedMesh[]> {
  const inputPath = join(workDirectory, "input.step");
  const outputDirectory = await mkdtemp(join(workDirectory, "output-"));
  const args = [
    "-m",
    "pantin_step_converter",
    "--input",
    inputPath,
    "--output-dir",
    outputDirectory,
  ];
  const outcome = await runProcess(options.spawn, options.pythonPath, args, limits).catch(
    (error: unknown) => {
      options.reportDetail(`Cannot start the STEP converter: ${String(error)}`);
      throw new ApiError(
        "conversion_unavailable",
        `The STEP converter could not be started with "${options.pythonPath}". Check --step-converter-python.`,
      );
    },
  );
  const verdict = interpretConverterRun(outcome, limits.timeLimitMs);
  if (!verdict.ok) {
    options.reportDetail(verdict.logDetail);
    throw conversionFailed(verdict.clientMessage);
  }
  return readComponents(outputDirectory, verdict.output);
}

export function createStepConverter(options: StepConverterOptions): StepConverter {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  return async (stepBytes) => {
    // Private directories (mkdtemp is mode 0700), always removed.
    const workDirectory = await mkdtemp(join(tmpdir(), "pantin-step-"));
    try {
      await writeFile(join(workDirectory, "input.step"), stepBytes, { flag: "wx" });
      return await runConversion(options, limits, workDirectory);
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  };
}

export function stepConverterUnavailable(): ApiError {
  return new ApiError(
    "conversion_unavailable",
    "STEP import is not set up. Create the converter environment with " +
      "packages/step-converter/setup.sh, then restart the core with " +
      "--step-converter-python packages/step-converter/.venv/bin/python.",
  );
}
