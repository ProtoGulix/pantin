import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildSampleGlb } from "../test-support/mesh-fixtures.ts";
import type { ProcessSpawner } from "./process-runner.ts";
import {
  type ConversionCaps,
  createStepConverter,
  DEFAULT_CONVERSION_CAPS,
} from "./step-converter.ts";

// A converter process that writes `fileCount` GLB files in its output
// directory, prints the matching JSON and exits 0.
function spawnerWritingComponents(fileCount: number, glbBytes: Uint8Array): ProcessSpawner {
  return (_command, args) => {
    const outputDirectory = args[args.indexOf("--output-dir") + 1] ?? "";
    const components = Array.from({ length: fileCount }, (_, index) => {
      const file = `part-${index}.glb`;
      writeFileSync(join(outputDirectory, file), glbBytes);
      return { file, faceFile: null, name: `part ${index}`, nodes: [] };
    });
    // Cast: a ChildProcess is an EventEmitter with streams; the runner only
    // reads stdout, stderr, exit codes and the close event, set just below.
    const child = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    Object.assign(child, { stdout, stderr: new PassThrough(), exitCode: null, signalCode: null });
    setImmediate(() => {
      stdout.end(JSON.stringify({ sourceUnit: "mm", components }));
      child.emit("close", 0, null);
    });
    return child;
  };
}

function converterWith(fileCount: number, caps: Partial<ConversionCaps>) {
  return createStepConverter({
    pythonPath: "python",
    spawn: spawnerWritingComponents(fileCount, buildSampleGlb()),
    reportDetail: () => undefined,
    caps,
  });
}

const STEP_BYTES = new TextEncoder().encode("ISO-10303-21;");

describe("conversion caps", () => {
  it("has defaults that leave room for a real machine (51 bodies)", () => {
    expect(DEFAULT_CONVERSION_CAPS.maxComponents).toBeGreaterThan(51);
  });

  it("accepts a conversion at the limits", async () => {
    const converted = await converterWith(2, { maxComponents: 2 })(STEP_BYTES);
    expect(converted.components).toHaveLength(2);
  });

  it("refuses too many components with an actionable error", async () => {
    await expect(converterWith(3, { maxComponents: 2 })(STEP_BYTES)).rejects.toMatchObject({
      code: "conversion_failed",
      message: expect.stringContaining("3 components, above the limit of 2"),
    });
  });

  it("refuses a component whose GLB is too large", async () => {
    await expect(
      converterWith(1, { maxGlbBytesPerComponent: 10 })(STEP_BYTES),
    ).rejects.toMatchObject({
      code: "conversion_failed",
      message: expect.stringContaining("export it as GLB or STL"),
    });
  });

  it("refuses meshes that are too large together", async () => {
    const glbSize = buildSampleGlb().byteLength;
    await expect(
      converterWith(2, { maxGlbBytesInTotal: glbSize + 1 })(STEP_BYTES),
    ).rejects.toMatchObject({
      code: "conversion_failed",
      message: expect.stringContaining("in total"),
    });
  });
});
