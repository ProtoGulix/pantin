import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createPantinDocument, serializePantinDocument } from "../domain/pantin-document.ts";
import type { PantinServerOptions, RunningPantinServer } from "../http/server.ts";
import { createManualTimer, type ManualTimer } from "./manual-timer.ts";
import { buildAsciiStl } from "./mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// A Pantin "axis" for the tag bus tests: a joint with a float setpoint and a
// valve with two bit commands, on manual clocks for the simulation and the bus.

export const SETPOINT = "carriage.stroke.setpoint";
export const POSITION = "carriage.stroke.position";
export const COIL_EXTEND = "carriage.valve.coil_14";
export const COIL_RETRACT = "carriage.valve.coil_12";

export type BusAxis = {
  server: RunningPantinServer;
  workspace: TestWorkspace;
  // The bus clock: pings, pongs and the hello deadline.
  busClock: ManualTimer;
  // One scheduler tick per step.
  runSeconds(seconds: number): void;
  close(): Promise<void>;
};

export async function startBusAxis(
  serverOptions: Partial<PantinServerOptions> = {},
): Promise<BusAxis> {
  const workspace = await createTestWorkspace();
  const simulationClock = createManualTimer();
  const busClock = createManualTimer();
  const server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: simulationClock.timer,
    busTimer: busClock.timer,
    ...serverOptions,
  });
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
  await sendJsonRequest(server, "POST", "/api/pantins/axis/drives", {
    name: "Valve",
    assembly: "carriage",
    type: "valve_5_3_closed",
  });
  // Saved, so that a discard (which re-reads io.json, ADR 0049 point 3) keeps the elements.
  await sendRaw(server, "POST", "/api/pantins/axis/save");
  return {
    server,
    workspace,
    busClock,
    runSeconds: (seconds) => {
      for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step += 1) {
        simulationClock.advance(STEP_SECONDS);
      }
    },
    close: async () => {
      await server.close();
      await workspace.remove();
    },
  };
}

export type BarePantin = {
  server: RunningPantinServer;
  close(): Promise<void>;
};

// A Pantin "axis" with no element, written straight to disk: for tests that
// need a core on an address REST helpers cannot reach (lan mode).
export async function startBarePantin(
  serverOptions: Partial<PantinServerOptions> = {},
): Promise<BarePantin> {
  const workspace = await createTestWorkspace();
  await mkdir(join(workspace.pantinsDirectory, "axis"));
  await writeFile(
    join(workspace.pantinsDirectory, "axis", "pantin.json"),
    serializePantinDocument(createPantinDocument("Axis")),
  );
  const server = await startTestServer(workspace.pantinsDirectory, serverOptions);
  return {
    server,
    close: async () => {
      await server.close();
      await workspace.remove();
    },
  };
}
