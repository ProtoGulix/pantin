import {
  type IoMappingResponse,
  IoMappingResponseSchema,
  type PantinResponse,
} from "@pantin/protocol";
import { afterEach, beforeEach } from "vitest";
import { type BusAxis, startBusAxis } from "./bus-axis.ts";
import { sendJsonRequest, sendRaw } from "./test-server.ts";

// The I/O edit routes of the "axis" test Pantin, as a test calls them.

export type IoCall = { status: number; answer: IoMappingResponse; text: string };

export async function callIo(
  axis: BusAxis,
  method: string,
  path: string,
  body?: unknown,
): Promise<IoCall> {
  const url = `/api/pantins/axis/io${path}`;
  const response =
    body === undefined
      ? await sendRaw(axis.server, method, url)
      : await sendJsonRequest(axis.server, method, url, body);
  const parsed = IoMappingResponseSchema.safeParse(response.json);
  return {
    status: response.status,
    // An error answer is not a mapping: tests then read `text`.
    answer: parsed.success ? parsed.data : emptyAnswer(),
    text: response.body,
  };
}

function emptyAnswer(): IoMappingResponse {
  return { status: "missing", mappingId: null, modules: [], problems: [], unmappedTags: [] };
}

export async function unsavedChanges(axis: BusAxis): Promise<boolean> {
  const response = await sendRaw(axis.server, "GET", "/api/pantins/axis");
  return (response.json as PantinResponse).unsavedChanges;
}

export const COIL = "carriage.valve.coil_14";
export const OTHER_COIL = "carriage.valve.coil_12";
export const SETPOINT_TAG = "carriage.stroke.setpoint";
export const POSITION_TAG = "carriage.stroke.position";

export type IoEditHarness = {
  axis: () => BusAxis;
  // The settings go in the module's modbus_tcp_slave transport; `extra` is beside it (a key).
  addModule(settings?: Record<string, unknown>, extra?: Record<string, unknown>): Promise<IoCall>;
  mapTags(names: string[], module?: string): Promise<IoCall>;
  call(method: string, path: string, body?: unknown): Promise<IoCall>;
};

/** Starts a fresh "axis" Pantin around each test and returns the calls on it. */
export function useIoAxis(): IoEditHarness {
  let current: BusAxis | undefined;
  beforeEach(async () => {
    current = await startBusAxis();
  });
  afterEach(async () => {
    await current?.close();
  });
  const axis = (): BusAxis => {
    if (current === undefined) {
      throw new Error("The axis starts in beforeEach.");
    }
    return current;
  };
  return {
    axis,
    addModule: (settings = {}, extra = {}) =>
      callIo(axis(), "POST", "/modules", {
        ...extra,
        transport: { kind: "modbus_tcp_slave", ...settings },
      }),
    mapTags: (names, module = "m1") =>
      callIo(axis(), "POST", `/modules/${module}/channels`, { tags: names }),
    call: (method, path, body) => callIo(axis(), method, path, body),
  };
}

export function channelOf(call: IoCall, tag: string) {
  return call.answer.modules.flatMap((module) => module.channels).find((c) => c.tag === tag);
}
