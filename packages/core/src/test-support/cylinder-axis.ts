import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TagListResponseSchema } from "@pantin/protocol";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import type { RunningPantinServer } from "../http/server.ts";
import { createManualTimer, type ManualTimer } from "./manual-timer.ts";
import { buildAsciiStl } from "./mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// A Pantin "axis" with a 100 mm stroke (rail to carriage) moved by a cylinder
// behind a valve, on a manual clock: the drive tests of phase 4. By default
// it is written as a version 8 document, a fused double-acting cylinder of
// ADR 0022, and reaches the core through the migration to version 9 (ADR 0028
// point 12), so that the phase 4 exit criterion runs through it with unchanged
// motion. Or the chain is built over REST from a drive and an actuator.

// The fused drive of ADR 0022, as a version 8 document holds it.
export const OLD_DRIVE = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "carriage",
  joints: ["stroke"],
  type: "double_acting_cylinder",
  speed: 0.2,
};

// What the migration makes of OLD_DRIVE: the actuator's id is derived from the drive's.
export const MIGRATED_ACTUATOR_ID = "valve-actuator";

export const VALVE = { name: "Valve", assembly: "carriage", type: "valve_5_3_closed" };

export const CYLINDER = {
  name: "Cylinder",
  assembly: "carriage",
  type: "double_acting_cylinder",
  extendSpeed: 0.2,
  retractSpeed: 0.2,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["stroke"],
};

export interface AxisChain {
  drive: Record<string, unknown>;
  actuator: Record<string, unknown>;
}

export interface CylinderAxis {
  server: RunningPantinServer;
  close(): Promise<void>;
  // One tick per step: the loop catches up at most 12 steps per tick (ADR 0012).
  runSeconds(seconds: number): void;
  writeTag(name: string, value: number): Promise<RawResponse>;
  strokePosition(): Promise<number>;
  tagNames(): Promise<string[]>;
}

const SOURCE = { fileName: "x.stl", format: "stl", unit: "mm", upAxis: "z", nodes: [] };

function oldBody(id: string) {
  return { id, name: id, assembly: id, source: SOURCE, mesh: `meshes/${id}.stl` };
}

// Written as the core of schema version 8 saved it.
async function writeOldAxis(directory: string, drive: Record<string, unknown>): Promise<void> {
  const folder = join(directory, "axis");
  await mkdir(join(folder, "meshes"), { recursive: true });
  for (const id of ["rail", "carriage"]) {
    await writeFile(join(folder, "meshes", `${id}.stl`), buildAsciiStl());
  }
  const stroke = {
    id: "stroke",
    tagKey: "stroke",
    name: "Stroke",
    type: "prismatic",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  };
  const document = {
    schema_version: 8,
    name: "Axis",
    assemblies: [
      { key: "rail", name: "rail" },
      { key: "carriage", name: "carriage" },
    ],
    bodies: ["rail", "carriage"].map(oldBody),
    joints: [stroke],
    drives: [drive],
    sensors: [],
  };
  await writeFile(join(folder, "pantin.json"), JSON.stringify(document));
}

async function buildChainOverRest(server: RunningPantinServer, chain: AxisChain): Promise<void> {
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Stroke",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  });
  await sendJsonRequest(server, "POST", "/api/pantins/axis/drives", chain.drive);
  await sendJsonRequest(server, "POST", "/api/pantins/axis/actuators", chain.actuator);
}

// With no chain, the axis is an old document that the core migrates on opening:
// `oldDrive` replaces the fused drive it holds.
export async function startCylinderAxis(
  options: { chain?: AxisChain; oldDrive?: Record<string, unknown> } = {},
): Promise<CylinderAxis> {
  const { chain, oldDrive = OLD_DRIVE } = options;
  const workspace: TestWorkspace = await createTestWorkspace();
  const clock: ManualTimer = createManualTimer();
  const server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: clock.timer,
  });
  if (chain === undefined) {
    await writeOldAxis(workspace.pantinsDirectory, oldDrive);
  } else {
    await buildChainOverRest(server, chain);
  }
  const tags = async () =>
    TagListResponseSchema.parse((await sendRaw(server, "GET", "/api/pantins/axis/tags")).json).tags;
  return {
    server,
    close: async () => {
      await server.close();
      await workspace.remove();
    },
    runSeconds: (seconds) => {
      for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step += 1) {
        clock.advance(STEP_SECONDS);
      }
    },
    writeTag: (name, value) =>
      sendJsonRequest(server, "PUT", `/api/pantins/axis/tags/${name}`, { value }),
    strokePosition: async () =>
      (await tags()).find((tag) => tag.name === "carriage.stroke.position")?.value ?? Number.NaN,
    tagNames: async () => (await tags()).map((tag) => tag.name),
  };
}
