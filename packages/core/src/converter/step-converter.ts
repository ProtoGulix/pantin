import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FaceFile, FaceFileSchema, MAX_FACE_FILE_BYTES } from "@pantin/protocol";
import type { AssemblyLocation } from "../domain/assembly-frames.ts";
import { hasGlbHeader } from "../domain/glb.ts";
import type { ConvertedComponent } from "../domain/step-bodies.ts";
import { formatIssues } from "../domain/validation.ts";
import { ApiError } from "../errors.ts";
import { type ConverterSuccess, interpretConverterRun } from "./converter-output.ts";
import { type ProcessLimits, type ProcessSpawner, runProcess } from "./process-runner.ts";

// Runs the Python STEP converter (ADR 0009) in a child process: a crash or a
// hang of OpenCascade cannot take the core down. Not a sandbox.

// `faceFile` is undefined when the converter wrote none or an unusable one:
// the body is imported all the same (ADR 0035 point 2).
type ConvertedMesh = ConvertedComponent & { glbBytes: Uint8Array; faceFile: FaceFile | undefined };

// `assemblyNodes`: the locations of the assembly nodes (ADR 0040 point 4),
// empty when the converter gives none.
type ConvertedStep = { components: ConvertedMesh[]; assemblyNodes: AssemblyLocation[] };

export type StepConverter = (stepBytes: Uint8Array) => Promise<ConvertedStep>;

export type StepConverterOptions = {
  pythonPath: string;
  spawn: ProcessSpawner;
  reportDetail: (detail: string) => void;
  limits?: Partial<ProcessLimits>;
  caps?: Partial<ConversionCaps>;
};

// What one conversion may produce before server mode makes it a risk for the
// core's memory: a STEP of thousands of tiny parts or of a huge mesh is
// refused with a message that says how to shrink it.
export type ConversionCaps = {
  maxComponents: number;
  maxGlbBytesPerComponent: number;
  maxGlbBytesInTotal: number;
};

export const DEFAULT_CONVERSION_CAPS: ConversionCaps = {
  maxComponents: 500,
  maxGlbBytesPerComponent: 64 * 1024 * 1024,
  maxGlbBytesInTotal: 256 * 1024 * 1024,
};

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

const DEFAULT_LIMITS: ProcessLimits = {
  timeLimitMs: 120_000,
  killGraceMs: 2_000,
  maxOutputBytes: 1024 * 1024,
};

function conversionFailed(message: string): ApiError {
  return new ApiError("conversion_failed", message);
}

async function readComponentGlb(
  outputDirectory: string,
  fileName: string,
  caps: ConversionCaps,
): Promise<Uint8Array> {
  const path = join(outputDirectory, fileName);
  // lstat: a symbolic link planted by the converter is never followed.
  const stats = await lstat(path).catch(() => undefined);
  if (stats === undefined || !stats.isFile()) {
    throw conversionFailed(
      `The STEP converter did not produce "${fileName}". Check the core logs.`,
    );
  }
  // Checked on the file size, before the file is read into memory.
  if (stats.size > caps.maxGlbBytesPerComponent) {
    throw conversionFailed(
      `The component "${fileName}" is ${megabytes(stats.size)} once converted, above the ` +
        `limit of ${megabytes(caps.maxGlbBytesPerComponent)}. Simplify the part in your CAD ` +
        `(fewer faces, no fine threads) or export it as GLB or STL.`,
    );
  }
  const bytes = new Uint8Array(await readFile(path));
  if (!hasGlbHeader(bytes)) {
    throw conversionFailed(`The STEP converter produced "${fileName}", which is not a GLB file.`);
  }
  return bytes;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// A face file the core cannot use costs the body its face file, not its import.
async function readFaceFile(
  outputDirectory: string,
  fileName: string,
  reportDetail: (detail: string) => void,
): Promise<FaceFile | undefined> {
  const path = join(outputDirectory, fileName);
  const stats = await lstat(path).catch(() => undefined);
  if (stats === undefined || !stats.isFile() || stats.size > MAX_FACE_FILE_BYTES) {
    reportDetail(`STEP converter face file "${fileName}" is missing, not a file or too large.`);
    return undefined;
  }
  const parsed = FaceFileSchema.safeParse(parseJson(await readFile(path, "utf8")));
  if (!parsed.success) {
    reportDetail(
      `STEP converter face file "${fileName}" is invalid: ${formatIssues(parsed.error.issues)}`,
    );
    return undefined;
  }
  return parsed.data;
}

function refuseTooManyComponents(output: ConverterSuccess, caps: ConversionCaps): void {
  if (output.components.length > caps.maxComponents) {
    throw conversionFailed(
      `The STEP file holds ${output.components.length} components, above the limit of ` +
        `${caps.maxComponents}. Import a sub-assembly, or merge small parts in your CAD.`,
    );
  }
}

async function readComponents(
  outputDirectory: string,
  output: ConverterSuccess,
  reportDetail: (detail: string) => void,
  caps: ConversionCaps,
): Promise<ConvertedMesh[]> {
  refuseTooManyComponents(output, caps);
  const meshes: ConvertedMesh[] = [];
  let totalBytes = 0;
  for (const component of output.components) {
    const glbBytes = await readComponentGlb(outputDirectory, component.file, caps);
    totalBytes += glbBytes.byteLength;
    if (totalBytes > caps.maxGlbBytesInTotal) {
      throw conversionFailed(
        `The converted meshes exceed ${megabytes(caps.maxGlbBytesInTotal)} in total. ` +
          `Import a sub-assembly, or simplify the parts in your CAD.`,
      );
    }
    const faceFile =
      component.faceFile === null
        ? undefined
        : await readFaceFile(outputDirectory, component.faceFile, reportDetail);
    meshes.push({ name: component.name, nodes: component.nodes, glbBytes, faceFile });
  }
  return meshes;
}

// The converter gives on stderr why a component has no face file.
function reportMissingFaceFiles(
  output: ConverterSuccess,
  stderr: string,
  reportDetail: (detail: string) => void,
): void {
  const names = output.components
    .filter((component) => component.faceFile === null)
    .map((component) => `"${component.name}"`);
  if (names.length > 0) {
    reportDetail(
      `STEP converter wrote no face file for ${names.join(", ")}. stderr: ${stderr.slice(-2000)}`,
    );
  }
}

async function runConversion(
  options: StepConverterOptions,
  limits: ProcessLimits,
  caps: ConversionCaps,
  workDirectory: string,
): Promise<ConvertedStep> {
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
  reportMissingFaceFiles(verdict.output, outcome.stderr, options.reportDetail);
  const components = await readComponents(
    outputDirectory,
    verdict.output,
    options.reportDetail,
    caps,
  );
  return { components, assemblyNodes: verdict.output.assemblyNodes ?? [] };
}

export function createStepConverter(options: StepConverterOptions): StepConverter {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const caps = { ...DEFAULT_CONVERSION_CAPS, ...options.caps };
  return async (stepBytes) => {
    // Private directories (mkdtemp is mode 0700), always removed.
    const workDirectory = await mkdtemp(join(tmpdir(), "pantin-step-"));
    try {
      await writeFile(join(workDirectory, "input.step"), stepBytes, { flag: "wx" });
      return await runConversion(options, limits, caps, workDirectory);
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
