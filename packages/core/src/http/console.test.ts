import {
  ApiErrorResponseSchema,
  ConsoleResponseSchema,
  PANTIN_SCHEMA_VERSION,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CYLINDER,
  type CylinderAxis,
  startCylinderAxis,
  VALVE,
} from "../test-support/cylinder-axis.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// The Pantin console of ADR 0031, read through its route. The default axis is
// a version 8 document, so its console starts with the migration.

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

async function readConsole(query = "", pantin = "axis") {
  const response = await sendRaw(axis.server, "GET", `/api/pantins/${pantin}/console${query}`);
  return { status: response.status, json: response.json };
}

async function entries(query = "") {
  return ConsoleResponseSchema.parse((await readConsole(query)).json).entries;
}

const putFault = (path: string, fault: string) =>
  sendJsonRequest(axis.server, "PUT", `/api/pantins/axis${path}/fault`, { fault });

describe("the console route", () => {
  it("shows the migration from the version on disk, with the times of the entry", async () => {
    await readConsole();
    const [entry] = await entries();
    expect(entry).toMatchObject({
      code: "migrated",
      level: "info",
      source: { kind: "pantin" },
      params: { from: 8, to: PANTIN_SCHEMA_VERSION },
      count: 1,
      sequence: 1,
      simulationTime: 0,
    });
    expect(Number.isNaN(Date.parse(entry?.wallTime ?? ""))).toBe(false);
  });

  it("returns only the entries after the given sequence", async () => {
    await putFault("/joints/stroke", "jammed");
    await putFault("/drives/valve", "unresponsive");
    expect((await entries()).map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect((await entries("?after=1")).map((entry) => entry.code)).toEqual([
      "fault_set",
      "fault_set",
    ]);
    const none = ConsoleResponseSchema.parse((await readConsole("?after=3")).json);
    expect(none).toMatchObject({ entries: [], lastSequence: 3 });
  });

  it.each(["?after=-1", "?after=1.5", "?after=abc", "?after=", "?after=1e3"])(
    "rejects the query %s",
    async (query) => {
      const { status, json } = await readConsole(query);
      expect(status).toBe(400);
      expect(ApiErrorResponseSchema.parse(json).error.code).toBe("invalid_request");
    },
  );

  it("answers 404 for an unknown Pantin", async () => {
    expect((await readConsole("", "ghost")).status).toBe(404);
  });
});

describe("faults in the console", () => {
  it("reports a fault set and cleared once each, however many times it is written", async () => {
    await putFault("/joints/stroke", "jammed");
    await putFault("/joints/stroke", "jammed");
    await putFault("/drives/valve", "unresponsive");
    await putFault("/drives/valve", "none");
    await putFault("/joints/stroke", "none");
    await putFault("/joints/stroke", "none");
    const faults = (await entries()).slice(1);
    expect(faults.map((entry) => [entry.code, entry.source, entry.params])).toEqual([
      ["fault_set", { kind: "joint", id: "stroke" }, { fault: "jammed" }],
      ["fault_set", { kind: "drive", id: "valve" }, { fault: "unresponsive" }],
      ["fault_cleared", { kind: "drive", id: "valve" }, { fault: "unresponsive" }],
      ["fault_cleared", { kind: "joint", id: "stroke" }, { fault: "jammed" }],
    ]);
    expect(faults.every((entry) => entry.level === "info" && entry.count === 1)).toBe(true);
  });
});

describe("diagnostics in the console", () => {
  it("raises once when the coils conflict, however many steps follow, and clears once", async () => {
    await axis.writeTag("carriage.valve.coil_14", 1);
    await axis.writeTag("carriage.valve.coil_12", 1);
    axis.runSeconds(0.5);
    const raised = (await entries()).filter((entry) => entry.code.startsWith("diagnostic"));
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      code: "diagnostic_raised",
      level: "warning",
      source: { kind: "drive", id: "valve" },
      params: { diagnostic: "conflicting_commands" },
      count: 1,
    });
    await axis.writeTag("carriage.valve.coil_12", 0);
    axis.runSeconds(0.5);
    const codes = (await entries()).map((entry) => entry.code);
    expect(codes.filter((code) => code === "diagnostic_cleared")).toHaveLength(1);
    expect(codes.at(-1)).toBe("diagnostic_cleared");
  });

  it("says nothing without a change", async () => {
    axis.runSeconds(0.5);
    expect((await entries()).map((entry) => entry.code)).toEqual(["migrated"]);
  });
});

async function setUpFaultAndDiagnostic(): Promise<void> {
  await axis.writeTag("carriage.valve.coil_14", 1);
  await axis.writeTag("carriage.valve.coil_12", 1);
  axis.runSeconds(0.1);
  await putFault("/drives/valve", "unresponsive");
}

async function tail(count: number) {
  return (await entries()).slice(-count).map((entry) => [entry.code, entry.source]);
}

describe("runtime state forgotten while a fault and a diagnostic are active", () => {
  const CLEARED = [
    ["fault_cleared", { kind: "drive", id: "valve" }],
    ["diagnostic_cleared", { kind: "drive", id: "valve" }],
  ];

  it("reports both as cleared when the Pantin is discarded", async () => {
    await setUpFaultAndDiagnostic();
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/discard", undefined);
    expect(await tail(2)).toEqual(CLEARED);
  });

  it("reports both as cleared when a drive edit forgets its state", async () => {
    await setUpFaultAndDiagnostic();
    await sendJsonRequest(axis.server, "PATCH", "/api/pantins/axis/drives/valve", {
      ...VALVE,
      type: "valve_5_2_single",
    });
    expect(await tail(2)).toEqual(CLEARED);
  });

  it("reports a jammed joint as cleared when the Pantin is discarded", async () => {
    await putFault("/joints/stroke", "jammed");
    await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/discard", undefined);
    expect(await tail(1)).toEqual([["fault_cleared", { kind: "joint", id: "stroke" }]]);
  });
});

describe("the console id", () => {
  it("is the same on every read and different for another console", async () => {
    const read = async (query = "") =>
      ConsoleResponseSchema.parse((await readConsole(query)).json).consoleId;
    const first = await read();
    expect(await read("?after=1")).toBe(first);
    const other = await startCylinderAxis();
    try {
      const response = await sendRaw(other.server, "GET", "/api/pantins/axis/console");
      expect(ConsoleResponseSchema.parse(response.json).consoleId).not.toBe(first);
    } finally {
      await other.close();
    }
  });
});

describe("a Pantin built over REST", () => {
  it("has no migration entry", async () => {
    const built = await startCylinderAxis({ chain: { drive: VALVE, actuator: CYLINDER } });
    try {
      const response = await sendRaw(built.server, "GET", "/api/pantins/axis/console");
      expect(ConsoleResponseSchema.parse(response.json)).toEqual({
        consoleId: expect.any(String),
        entries: [],
        lastSequence: 0,
      });
    } finally {
      await built.close();
    }
  });
});
