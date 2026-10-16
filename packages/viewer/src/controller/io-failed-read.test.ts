import { describe, expect, it } from "vitest";
import { setCentralLayout } from "./diagram-actions.ts";
import { ioIntents } from "./io-actions.ts";
import { answer, ioStore, settle } from "./io-reload-test-helpers.ts";

describe("a failed read", () => {
  it("is not retried by the hook, and Retry reads again", async () => {
    let reads = 0;
    let failing = true;
    const store = await ioStore({
      getIoMapping: async () => {
        reads += 1;
        if (failing) {
          throw new Error("down");
        }
        return answer("m1");
      },
    });
    expect(store.state.io.failedFor).toBe(store.state.openPantin);
    store.update({ ...store.state, selection: { kind: "drive", id: "d1" } });
    await settle();
    expect(reads).toBe(1);
    failing = false;
    ioIntents(store).retryIoMapping();
    await settle();
    expect(reads).toBe(2);
    expect(store.state.io.failedFor).toBeNull();
    expect(store.state.io.mapping).not.toBeNull();
  });

  it("is forgotten when the I/O layout is entered, which reads again", async () => {
    let reads = 0;
    let failing = true;
    const store = await ioStore(
      {
        getIoMapping: async () => {
          reads += 1;
          if (failing) {
            throw new Error("down");
          }
          return answer("m1");
        },
      },
      "3d",
    );
    failing = false;
    setCentralLayout(store, "io");
    await settle();
    expect(reads).toBe(2);
    expect(store.state.io.mapping).not.toBeNull();
  });
});
