import {
  type ConsoleEntry,
  ConsoleResponseSchema,
  type Tag,
  TagListResponseSchema,
} from "@pantin/protocol";
import type { BusAxis } from "./bus-axis.ts";
import type { BusClient } from "./bus-client.ts";
import { connectBus } from "./bus-client.ts";
import { PLC_MAPPING_ID } from "./fake-io-mapping.ts";
import { type RawResponse, sendJsonRequest, sendRaw } from "./test-server.ts";

// The REST face and the role handshakes the tag bus tests share.

export function putTag(axis: BusAxis, name: string, value: unknown): Promise<RawResponse> {
  return sendJsonRequest(axis.server, "PUT", `/api/pantins/axis/tags/${name}`, { value });
}

export function deleteForce(axis: BusAxis, name: string): Promise<RawResponse> {
  return sendRaw(axis.server, "DELETE", `/api/pantins/axis/tags/${name}/force`);
}

export function deleteForces(axis: BusAxis): Promise<RawResponse> {
  return sendRaw(axis.server, "DELETE", "/api/pantins/axis/forces");
}

export async function listTags(axis: BusAxis): Promise<Tag[]> {
  return TagListResponseSchema.parse(
    (await sendRaw(axis.server, "GET", "/api/pantins/axis/tags")).json,
  ).tags;
}

export async function tagNamed(axis: BusAxis, name: string): Promise<Tag | undefined> {
  return (await listTags(axis)).find((tag) => tag.name === name);
}

export async function consoleEntries(axis: BusAxis): Promise<ConsoleEntry[]> {
  const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/console");
  return ConsoleResponseSchema.parse(response.json).entries;
}

// Posts a lifecycle action: reset, discard or save.
export async function postRuntime(
  axis: BusAxis,
  action: "reset" | "discard" | "save",
): Promise<void> {
  await sendRaw(axis.server, "POST", `/api/pantins/axis/${action}`);
}

/** A connected client with its welcome taken, in the given role. */
export async function openRole(
  axis: BusAxis,
  role: "client" | "plc",
  opened: BusClient[],
  options: { autoPong?: boolean } = {},
): Promise<BusClient> {
  const client = await connectBus(axis.server, options);
  opened.push(client);
  client.send(
    role === "plc"
      ? { type: "hello", version: 1, role, mappingId: PLC_MAPPING_ID }
      : { type: "hello", version: 1, role },
  );
  await client.next("welcome");
  return client;
}
