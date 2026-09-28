import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildGlb } from "./mesh-fixtures.ts";

// A stand-in for `python -m pantin_step_converter`: an executable Node script
// whose shebang is this Node binary, so it is passed as the "python" path.
// It records its pid and output directory next to itself for the tests.

export const MINIMAL_STEP_TEXT =
  "ISO-10303-21;\nHEADER;\nFILE_NAME('box.step');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n";

const COMPONENT_GLB = buildGlb({
  asset: { version: "2.0" },
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "component" }],
});

function preamble(): string {
  return `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const valueOf = (flag) => args[args.indexOf(flag) + 1];
const inputPath = valueOf("--input");
const outputDir = valueOf("--output-dir");
const here = new URL(".", import.meta.url).pathname;
writeFileSync(join(here, "pid"), String(process.pid));
writeFileSync(join(here, "output-dir"), outputDir);
if (args[0] !== "-m" || args[1] !== "pantin_step_converter" || !inputPath || !outputDir) {
  process.stderr.write("unexpected arguments " + JSON.stringify(args));
  process.exit(3);
}
if (!readFileSync(inputPath, "utf8").startsWith("ISO-10303-21;")) {
  process.stdout.write(JSON.stringify({ error: "input is not the uploaded STEP" }));
  process.exit(2);
}
const glb = Buffer.from("${Buffer.from(COMPONENT_GLB).toString("base64")}", "base64");
const writeGlb = (name) => writeFileSync(join(outputDir, name), glb);
const reply = (value) => process.stdout.write(JSON.stringify(value));
`;
}

export const TWO_COMPONENTS = {
  sourceUnit: "mm",
  components: [
    {
      file: "0.glb",
      name: "Carriage 3630.00",
      nodes: [
        { name: "AXIS_800", path: [0] },
        { name: "Carriage 3630.00", path: [0, 0] },
      ],
    },
    {
      file: "1.glb",
      name: "Carriage 3630.00",
      nodes: [
        { name: "AXIS_800", path: [0] },
        { name: "Carriage 3630.00", path: [0, 1] },
      ],
    },
  ],
};

const FAKE_CONVERTER_BEHAVIOURS = {
  success: `writeGlb("0.glb"); writeGlb("1.glb"); reply(${JSON.stringify(TWO_COMPONENTS)});`,
  missingSecondFile: `writeGlb("0.glb"); reply(${JSON.stringify(TWO_COMPONENTS)});`,
  secondFileNotGlb: `writeGlb("0.glb"); writeFileSync(join(outputDir, "1.glb"), "nope"); reply(${JSON.stringify(TWO_COMPONENTS)});`,
  escapingFileName: `writeGlb("0.glb"); reply({ sourceUnit: "mm", components: [{ file: "../0.glb", name: "x", nodes: [] }] });`,
  refusal: `reply({ error: "The file contains no solid. Export the bodies as solids." }); process.exit(2);`,
  crash: `process.stderr.write("Segmentation fault in BRepMesh"); process.exit(1);`,
  invalidJson: `process.stdout.write("this is not json");`,
  oversizedOutput: `process.stdout.write("x".repeat(64 * 1024));`,
  hang: `process.on("SIGTERM", () => undefined); setInterval(() => undefined, 1000);`,
} as const;

export type FakeConverterBehaviour = keyof typeof FAKE_CONVERTER_BEHAVIOURS;

// Returns the path to pass as the converter's python.
export async function writeFakeConverter(
  directory: string,
  behaviour: FakeConverterBehaviour,
): Promise<string> {
  const path = join(directory, "fake-python.mjs");
  await writeFile(path, `${preamble()}${FAKE_CONVERTER_BEHAVIOURS[behaviour]}\n`);
  await chmod(path, 0o755);
  return path;
}
