import { describe, expect, it } from "vitest";
import { createLatestWinsSender } from "./latest-wins-sender.ts";

// A request the test finishes by hand.
function controlledSend() {
  const sent: number[] = [];
  const finishers: (() => void)[] = [];
  const failers: ((error: Error) => void)[] = [];
  const send = (value: number) => {
    sent.push(value);
    return new Promise<void>((resolve, reject) => {
      finishers.push(resolve);
      failers.push(reject);
    });
  };
  return { send, sent, finishers, failers };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("latest-wins sender", () => {
  it("sends the first value at once", () => {
    const { send, sent } = controlledSend();
    createLatestWinsSender(send, () => undefined).push(1);
    expect(sent).toEqual([1]);
  });

  it("keeps one request in flight and sends only the latest of the values pushed meanwhile", async () => {
    const { send, sent, finishers } = controlledSend();
    const sender = createLatestWinsSender(send, () => undefined);
    sender.push(1);
    sender.push(2);
    sender.push(3);
    sender.push(4);
    expect(sent).toEqual([1]);
    finishers[0]?.();
    await flush();
    expect(sent).toEqual([1, 4]);
    finishers[1]?.();
    await flush();
    expect(sent).toEqual([1, 4]);
  });

  it("sends again right away once idle", async () => {
    const { send, sent, finishers } = controlledSend();
    const sender = createLatestWinsSender(send, () => undefined);
    sender.push(1);
    finishers[0]?.();
    await flush();
    sender.push(2);
    expect(sent).toEqual([1, 2]);
  });
});

describe("latest-wins sender, failures and idling", () => {
  it("reports a failure and still sends the value that waited", async () => {
    const { send, sent, failers } = controlledSend();
    const errors: unknown[] = [];
    const sender = createLatestWinsSender(send, (error) => errors.push(error));
    sender.push(1);
    sender.push(2);
    failers[0]?.(new Error("refused"));
    await flush();
    expect(errors).toHaveLength(1);
    expect(sent).toEqual([1, 2]);
  });

  it("settles when nothing is in flight or waiting", async () => {
    const { send, finishers } = controlledSend();
    const sender = createLatestWinsSender(send, () => undefined);
    await sender.settled();
    sender.push(1);
    sender.push(2);
    let settled = false;
    void sender.settled().then(() => {
      settled = true;
    });
    finishers[0]?.();
    await flush();
    expect(settled).toBe(false);
    finishers[1]?.();
    await flush();
    expect(settled).toBe(true);
  });
});
