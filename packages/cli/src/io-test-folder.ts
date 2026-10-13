import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A copy of examples/axis with a 5/3 valve added, for the io commands' tests:
// its tags are axis.stroke.setpoint and position (float), then
// axis.valve.coil_14 and coil_12 (bit commands).

const EXAMPLE = fileURLToPath(new URL("../../../examples/axis", import.meta.url));

export const AXIS_TAGS = [
  "axis.stroke.setpoint",
  "axis.stroke.position",
  "axis.valve.coil_14",
  "axis.valve.coil_12",
];

export async function copyAxisWithValve(workspace: string): Promise<string> {
  const folder = join(await mkdtemp(join(workspace, "axis-")), "axis");
  await cp(EXAMPLE, folder, { recursive: true });
  const path = join(folder, "pantin.json");
  const document: Record<string, unknown> = JSON.parse(await readFile(path, "utf8"));
  document.drives = [
    { id: "valve", tagKey: "valve", name: "Valve", assembly: "axis", type: "valve_5_3_closed" },
  ];
  await writeFile(path, JSON.stringify(document));
  return folder;
}

export function tmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pantin-io-"));
}
