import type { TagBusServerMessage } from "@pantin/protocol";
import { describe, expect, it, vi } from "vitest";
import { handleMessage, serve } from "./bridge.ts";
import type { BusClient } from "./bus-client.ts";
import { deferred } from "./deferred.ts";
import {
  AuthenticationFailedError,
  type BridgeError,
  BusClosedError,
  MappingChangedError,
} from "./errors.ts";
import type { Logger } from "./logger.ts";
import type { ModuleSessions } from "./opcua/session.ts";

function fakeSessions(
  failed: Promise<BridgeError> = new Promise(() => undefined),
): ModuleSessions & { applied: TagBusServerMessage[] } {
  const applied: TagBusServerMessage[] = [];
  return {
    applied,
    failed,
    start: () => undefined,
    applyTags: (message) => {
      applied.push(message);
    },
    stop: () => Promise.resolve(),
  };
}

function fakeLog(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const at = (level: string) => (message: string) => lines.push(`${level} ${message}`);
  return {
    lines,
    debug: at("DEBUG"),
    info: at("INFO"),
    warning: at("WARNING"),
    error: at("ERROR"),
  };
}

const SNAPSHOT: TagBusServerMessage = {
  type: "snapshot",
  step: 1,
  tags: [{ name: "press.cylinder.extended", value: 1, forced: false }],
};

describe("handleMessage", () => {
  it("passes snapshots and tags to the sessions", () => {
    const sessions = fakeSessions();
    const tags: TagBusServerMessage = { type: "tags", step: 2, tags: [] };

    handleMessage(SNAPSHOT, sessions, fakeLog());
    handleMessage(tags, sessions, fakeLog());

    expect(sessions.applied).toEqual([SNAPSHOT, tags]);
  });

  it("ends the bridge on io_changed", () => {
    expect(() => handleMessage({ type: "io_changed" }, fakeSessions(), fakeLog())).toThrow(
      MappingChangedError,
    );
  });

  it("logs a PLC write ignored because its tag is forced, and a core error", () => {
    const log = fakeLog();
    const sessions = fakeSessions();

    handleMessage(
      {
        type: "ack",
        id: "b1",
        tag: { name: "press.valve.extend", value: 1, forced: true },
        ignored: "forced",
      },
      sessions,
      log,
    );
    handleMessage(
      { type: "error", id: null, code: "invalid_request", message: "Unknown tag." },
      sessions,
      log,
    );

    expect(log.lines).toEqual([
      "INFO PLC write to press.valve.extend ignored: the tag is forced in the core.",
      "WARNING Core error invalid_request: Unknown tag.",
    ]);
    expect(sessions.applied).toEqual([]);
  });

  it("ignores messages that need no action", () => {
    const sessions = fakeSessions();

    handleMessage({ type: "ack", id: "b1", tag: null, ignored: null }, sessions, fakeLog());
    handleMessage(
      {
        type: "clock",
        clock: { running: true, step: 1, stepSeconds: 0.01, achievedRatio: 1, droppedSteps: 0 },
      },
      sessions,
      fakeLog(),
    );

    expect(sessions.applied).toEqual([]);
  });
});

function fakeBus() {
  const ended = deferred<BusClosedError>();
  let listener: (message: TagBusServerMessage) => void = () => undefined;
  const bus = {
    onMessage: (next: typeof listener) => {
      listener = next;
    },
    ended: ended.promise,
  } as unknown as BusClient; // only the two members serve() uses
  return { bus, ended, deliver: (message: TagBusServerMessage) => listener(message) };
}

describe("serve", () => {
  it("returns when asked to terminate", async () => {
    const { bus } = fakeBus();
    const terminated = deferred<void>();
    const served = serve({
      bus,
      sessions: fakeSessions(),
      log: fakeLog(),
      terminated: terminated.promise,
    });

    terminated.resolve();

    await expect(served).resolves.toBeUndefined();
  });

  it("throws the error of a message that ends the bridge", async () => {
    const { bus, deliver } = fakeBus();
    const served = serve({
      bus,
      sessions: fakeSessions(),
      log: fakeLog(),
      terminated: new Promise(() => undefined),
    });

    deliver({ type: "io_changed" });

    await expect(served).rejects.toThrow(MappingChangedError);
  });

  it("throws the error of a closed bus", async () => {
    const { bus, ended } = fakeBus();
    const served = serve({
      bus,
      sessions: fakeSessions(),
      log: fakeLog(),
      terminated: new Promise(() => undefined),
    });

    ended.resolve(new BusClosedError("gone"));

    await expect(served).rejects.toThrow(BusClosedError);
  });

  it("throws the failure a session reports, which ends the whole bridge", async () => {
    const { bus } = fakeBus();
    const failed = deferred<BridgeError>();
    const served = serve({
      bus,
      sessions: fakeSessions(failed.promise),
      log: fakeLog(),
      terminated: new Promise(() => undefined),
    });

    failed.resolve(new AuthenticationFailedError("refused", "plc"));

    await expect(served).rejects.toThrow(AuthenticationFailedError);
  });

  it("feeds the sessions until it ends", async () => {
    const { bus, deliver } = fakeBus();
    const sessions = fakeSessions();
    const terminated = deferred<void>();
    const served = serve({ bus, sessions, log: fakeLog(), terminated: terminated.promise });
    const spy = vi.spyOn(sessions, "applyTags");

    deliver(SNAPSHOT);
    terminated.resolve();
    await served;

    expect(spy).toHaveBeenCalledWith(SNAPSHOT);
  });
});
