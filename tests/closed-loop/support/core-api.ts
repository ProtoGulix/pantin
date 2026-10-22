import {
  BridgeListResponseSchema,
  type BridgeStatus,
  type IoMappingResponse,
  IoMappingResponseSchema,
  SimulationClockStateSchema,
  TagListResponseSchema,
} from "@pantin/protocol";

// The core's public HTTP API, as the viewer and the command line use it. Every answer goes
// through its protocol schema.

const WAIT_TIMEOUT_MILLISECONDS = 15_000;
const POLL_INTERVAL_MILLISECONDS = 25;

export type CoreApi = {
  io(): Promise<IoMappingResponse>;
  startClock(): Promise<void>;
  tagValue(name: string): Promise<number>;
  bridge(kind: BridgeStatus["transport"]): Promise<BridgeStatus>;
  putBridge(kind: BridgeStatus["transport"], body: object): Promise<void>;
  /** Polls the status of a bridge until `predicate` holds, then answers it. */
  waitForBridge(
    kind: BridgeStatus["transport"],
    description: string,
    predicate: (status: BridgeStatus) => boolean,
  ): Promise<BridgeStatus>;
};

async function request(
  pantinUrl: string,
  path: string,
  method: string,
  body?: object,
): Promise<unknown> {
  const response = await fetch(`${pantinUrl}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
  }
  return JSON.parse(text) as unknown; // Parsed by the schema of each caller, never trusted as is.
}

export function createCoreApi(baseUrl: string, pantinId: string): CoreApi {
  const pantinUrl = `${baseUrl}/api/pantins/${pantinId}`;

  async function bridge(kind: BridgeStatus["transport"]): Promise<BridgeStatus> {
    const list = BridgeListResponseSchema.parse(await request(pantinUrl, "/bridges", "GET"));
    const status = list.bridges.find((candidate) => candidate.transport === kind);
    if (status === undefined) {
      throw new Error(`The bridge list has no ${kind} bridge.`);
    }
    return status;
  }

  return {
    io: async () => IoMappingResponseSchema.parse(await request(pantinUrl, "/io", "GET")),
    startClock: async () => {
      const clock = SimulationClockStateSchema.parse(await request(pantinUrl, "/clock", "GET"));
      if (!clock.running) {
        await request(pantinUrl, "/clock", "PUT", { running: true });
      }
    },
    tagValue: async (name) => {
      const tags = TagListResponseSchema.parse(await request(pantinUrl, "/tags", "GET")).tags;
      const tag = tags.find((candidate) => candidate.name === name);
      if (tag === undefined) {
        throw new Error(`The Pantin has no tag ${name}.`);
      }
      return tag.value;
    },
    bridge,
    putBridge: async (kind, body) => {
      await request(pantinUrl, `/bridges/${kind}`, "PUT", body);
    },
    waitForBridge: async (kind, description, predicate) => {
      const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
      for (;;) {
        const status = await bridge(kind);
        if (predicate(status)) {
          return status;
        }
        if (Date.now() > deadline) {
          throw new Error(`The ${kind} bridge never ${description}: ${JSON.stringify(status)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
      }
    },
  };
}

/** Polls `read` until `predicate` holds, to a deadline: no fixed sleep decides a test. */
export async function pollUntil<Value>(
  description: string,
  read: () => Promise<Value>,
  predicate: (value: Value) => boolean,
): Promise<Value> {
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  for (;;) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}; last value: ${String(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
  }
}
