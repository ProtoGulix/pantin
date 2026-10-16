import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useIoAxis } from "../test-support/io-edits.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Renames that chain, swap or hit a stale channel never map one tag twice.

const io = useIoAxis();
const coil = (key: string) => `carriage.${key}.coil_14`;
const server = () => io.axis().server;

async function drive(key: string, mapped = true) {
  await sendJsonRequest(server(), "POST", "/api/pantins/axis/drives", {
    name: key,
    assembly: "carriage",
    type: "valve_5_3_closed",
  });
  if (mapped) {
    await io.mapTags([coil(key)]);
  }
}

const rename = (from: string, to: string) =>
  sendJsonRequest(server(), "PUT", `/api/pantins/axis/drives/${from}/tag-key`, { tagKey: to });

async function mappedTags(): Promise<string[]> {
  const answer = (await io.call("GET", "")).answer;
  return answer.modules.flatMap((module) => module.channels.map((channel) => channel.tag));
}

const expectNoDuplicate = (tags: string[]) => expect(new Set(tags).size).toBe(tags.length);

async function staleChainSetup() {
  await io.addModule();
  await drive("c");
  await drive("a");
  await drive("b");
  await sendRaw(server(), "DELETE", "/api/pantins/axis/drives/c");
}

describe("a chain onto a stale tag", () => {
  it("refuses both renames, with no read between them", async () => {
    await staleChainSetup();
    await rename("b", "c");
    await rename("a", "b");
    const tags = await mappedTags();
    expectNoDuplicate(tags);
    expect(tags.sort()).toEqual([coil("a"), coil("b"), coil("c")]);
    await sendRaw(server(), "POST", "/api/pantins/axis/save");
    const saved = JSON.parse(
      await readFile(join(io.axis().workspace.pantinsDirectory, "axis", "io.json"), "utf8"),
    );
    expectNoDuplicate(
      saved.modules.flatMap((m: { channels: { tag: string }[] }) => m.channels.map((c) => c.tag)),
    );
  });

  it("gives the same result with a read between the renames", async () => {
    await staleChainSetup();
    await rename("b", "c");
    await mappedTags();
    await rename("a", "b");
    const tags = await mappedTags();
    expectNoDuplicate(tags);
    expect(tags.sort()).toEqual([coil("a"), coil("b"), coil("c")]);
  });
});

describe("swaps and chains", () => {
  it("carries a swap of two drives", async () => {
    await io.addModule();
    await drive("a");
    await drive("b");
    await rename("a", "tmp");
    await rename("b", "a");
    await rename("a", "b");
    const tags = await mappedTags();
    expectNoDuplicate(tags);
    expect(tags.sort()).toEqual([coil("a"), coil("b")]);
  });

  it("carries a three-step chain onto a free name", async () => {
    await io.addModule();
    await drive("a");
    await drive("b");
    await drive("c");
    await rename("c", "d");
    await rename("b", "c");
    await rename("a", "b");
    const tags = await mappedTags();
    expectNoDuplicate(tags);
    expect(tags.sort()).toEqual([coil("b"), coil("c"), coil("d")]);
    expect((await io.call("GET", "")).answer.status).toBe("valid");
  });

  it("refuses the whole chain when its end is a stale tag", async () => {
    await staleChainSetup();
    await drive("z", false);
    await rename("b", "c");
    await rename("a", "b");
    await rename("z", "a");
    expectNoDuplicate(await mappedTags());
  });
});
