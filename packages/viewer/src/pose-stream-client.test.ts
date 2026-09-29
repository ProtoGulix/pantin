import { describe, expect, it } from "vitest";
import {
  createPoseStreamClient,
  type PoseEventSource,
  type PoseStreamCallbacks,
} from "./pose-stream-client.ts";

class FakeSource implements PoseEventSource {
  readyState = 1;
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, (event: { data: unknown }) => void>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data });
  }
}

function setUp() {
  const sources: FakeSource[] = [];
  const snapshots: unknown[] = [];
  const invalid: string[] = [];
  let closedCount = 0;
  const callbacks: PoseStreamCallbacks = {
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onInvalid: (detail) => invalid.push(detail),
    onClosed: () => {
      closedCount += 1;
    },
  };
  const client = createPoseStreamClient((url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source;
  }, callbacks);
  return { client, sources, snapshots, invalid, closedCount: () => closedCount };
}

const VALID = JSON.stringify({
  stepCount: 3,
  jointPositions: [],
  bodies: [{ bodyId: "a", translation: [0, 0, 1], rotation: [0, 0, 0, 1] }],
});

describe("createPoseStreamClient", () => {
  it("opens the stream of the Pantin, with its id encoded", () => {
    const { client, sources } = setUp();
    client.follow("my pantin");
    expect(sources.map((source) => source.url)).toEqual(["/api/pantins/my%20pantin/pose/stream"]);
  });

  it("delivers valid snapshots", () => {
    const { client, sources, snapshots } = setUp();
    client.follow("p");
    sources[0]?.emit("pose", VALID);
    expect(snapshots).toHaveLength(1);
  });

  it("reports invalid JSON and contract breaks instead of throwing", () => {
    const { client, sources, snapshots, invalid } = setUp();
    client.follow("p");
    sources[0]?.emit("pose", "not json");
    sources[0]?.emit("pose", JSON.stringify({ stepCount: -1 }));
    expect(snapshots).toHaveLength(0);
    expect(invalid).toHaveLength(2);
  });

  it("ignores other event names", () => {
    const { client, sources, snapshots, invalid } = setUp();
    client.follow("p");
    sources[0]?.emit("other", VALID);
    expect(snapshots.length + invalid.length).toBe(0);
  });
});

describe("createPoseStreamClient lifecycle", () => {
  it("keeps the stream for the same Pantin and replaces it for another", () => {
    const { client, sources } = setUp();
    client.follow("a");
    client.follow("a");
    expect(sources).toHaveLength(1);
    client.follow("b");
    expect(sources).toHaveLength(2);
    expect(sources[0]?.closed).toBe(true);
    expect(sources[1]?.closed).toBe(false);
  });

  it("closes on null and ignores what a closed stream still says", () => {
    const { client, sources, snapshots } = setUp();
    client.follow("a");
    client.follow(null);
    expect(sources[0]?.closed).toBe(true);
    sources[0]?.emit("pose", VALID);
    expect(snapshots).toHaveLength(0);
  });

  it("reports a stream the browser gave up on, but not a reconnecting one", () => {
    const { client, sources, closedCount } = setUp();
    client.follow("a");
    sources[0]?.onerror?.(new Event("error"));
    expect(closedCount()).toBe(0);
    if (sources[0] !== undefined) {
      sources[0].readyState = 2;
    }
    sources[0]?.onerror?.(new Event("error"));
    expect(closedCount()).toBe(1);
  });

  it("opens the same Pantin again after the browser gave up", () => {
    const { client, sources } = setUp();
    client.follow("a");
    if (sources[0] !== undefined) {
      sources[0].readyState = 2;
    }
    sources[0]?.onerror?.(new Event("error"));
    client.follow("a");
    expect(sources.map((source) => source.url)).toEqual([
      "/api/pantins/a/pose/stream",
      "/api/pantins/a/pose/stream",
    ]);
  });
});
