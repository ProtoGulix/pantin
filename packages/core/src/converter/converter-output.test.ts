import { describe, expect, it } from "vitest";
import { interpretConverterRun, type ProcessOutcome } from "./converter-output.ts";

const VALID_OUTPUT = {
  sourceUnit: "mm",
  components: [
    { file: "0.glb", faceFile: "0.faces.json", name: "Rail", nodes: [{ name: "Rail", path: [0] }] },
  ],
};

function outcome(overrides: Partial<ProcessOutcome>): ProcessOutcome {
  return {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify(VALID_OUTPUT),
    stderr: "",
    timedOut: false,
    outputTooLarge: false,
    ...overrides,
  };
}

describe("interpretConverterRun", () => {
  it("accepts a valid success object", () => {
    expect(interpretConverterRun(outcome({}), 1000)).toEqual({ ok: true, output: VALID_OUTPUT });
  });

  it.each<[string, Partial<ProcessOutcome>]>([
    ["exit 2 without error object", { exitCode: 2, stdout: "{}" }],
    ["killed by a signal", { exitCode: null, signal: "SIGSEGV" }],
    ["exit 3", { exitCode: 3 }],
    ["no components", { stdout: JSON.stringify({ sourceUnit: "mm", components: [] }) }],
    [
      "a nested file",
      {
        stdout: JSON.stringify({
          ...VALID_OUTPUT,
          components: [{ file: "a/0.glb", faceFile: null, name: "", nodes: [] }],
        }),
      },
    ],
    [
      "a non GLB file",
      {
        stdout: JSON.stringify({
          ...VALID_OUTPUT,
          components: [{ file: "0.step", faceFile: null, name: "", nodes: [] }],
        }),
      },
    ],
    [
      "negative node path",
      {
        stdout: JSON.stringify({
          ...VALID_OUTPUT,
          components: [
            { file: "0.glb", faceFile: null, name: "", nodes: [{ name: "a", path: [-1] }] },
          ],
        }),
      },
    ],
  ])("fails with a generic message on %s", (_description, overrides) => {
    const verdict = interpretConverterRun(outcome(overrides), 1000);
    expect(verdict).toMatchObject({
      ok: false,
      clientMessage: expect.stringContaining("core logs"),
    });
  });
});

describe("interpretConverterRun face file names (ADR 0035)", () => {
  it.each<[string, Partial<ProcessOutcome>]>([
    [
      "no faceFile field (ADR 0009 point 3 requires it, null when there is none)",
      {
        stdout: JSON.stringify({
          ...VALID_OUTPUT,
          components: [{ file: "0.glb", name: "", nodes: [] }],
        }),
      },
    ],
    [
      "a face file outside the output directory",
      {
        stdout: JSON.stringify({
          ...VALID_OUTPUT,
          components: [{ file: "0.glb", faceFile: "../0.faces.json", name: "", nodes: [] }],
        }),
      },
    ],
  ])("fails with a generic message on %s", (_description, overrides) => {
    expect(interpretConverterRun(outcome(overrides), 1000)).toMatchObject({ ok: false });
  });
});

describe("interpretConverterRun messages", () => {
  it("passes the converter's own message on exit 2", () => {
    const verdict = interpretConverterRun(
      outcome({ exitCode: 2, stdout: JSON.stringify({ error: "Unit unknown." }) }),
      1000,
    );
    expect(verdict).toMatchObject({
      ok: false,
      clientMessage: "The STEP file could not be converted: Unit unknown.",
    });
  });

  it("reports a timeout in seconds, before looking at the output", () => {
    const verdict = interpretConverterRun(outcome({ timedOut: true, exitCode: 0 }), 120_000);
    expect(verdict).toMatchObject({
      ok: false,
      clientMessage: expect.stringContaining("longer than 120 s"),
    });
  });
});
