import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IoDocumentSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { listTags } from "../test-support/bus-rest.ts";
import {
  COIL,
  channelOf,
  OTHER_COIL,
  SETPOINT_TAG,
  unsavedChanges,
  useIoAxis,
} from "../test-support/io-edits.ts";
import { discardAxis } from "../test-support/io-files.ts";
import { sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// Renames carry over into io.json (ADR 0049 point 10), read after read.

const io = useIoAxis();
const NEW_COIL = "carriage.distributeur.coil_14";

const renameValve = (tagKey: string) =>
  sendJsonRequest(io.axis().server, "PUT", "/api/pantins/axis/drives/valve/tag-key", { tagKey });
const post = (path: string, body: unknown) =>
  sendJsonRequest(io.axis().server, "POST", `/api/pantins/axis${path}`, body);
const del = (path: string) => sendRaw(io.axis().server, "DELETE", `/api/pantins/axis${path}`);
const save = () => post("/save", {});

async function mapValveAndSetpoint() {
  await io.addModule();
  return io.mapTags([COIL, OTHER_COIL, SETPOINT_TAG]);
}

describe("a renamed tag", () => {
  it("keeps its channel under the new name, with its variable, address and comment", async () => {
    await mapValveAndSetpoint();
    await io.call("PATCH", `/channels/${COIL}`, { comment: "extend" });
    const before = (await io.call("GET", "")).answer;
    expect((await renameValve("distributeur")).status).toBe(200);
    const after = await io.call("GET", "");
    expect(after.answer.status).toBe("valid");
    expect(channelOf(after, COIL)).toBeUndefined();
    expect(channelOf(after, NEW_COIL)).toMatchObject({
      variable: "carriage_valve_coil_14",
      address: 0,
      comment: "extend",
      owner: { kind: "drive", id: "valve" },
    });
    expect(after.answer.mappingId).not.toBe(before.mappingId);
    expect(after.answer.unmappedTags.map((tag) => tag.name)).toEqual(["carriage.stroke.position"]);
  });
});

describe("renames in a row", () => {
  it("follow one another, read or not", async () => {
    await mapValveAndSetpoint();
    await renameValve("first");
    await renameValve("second");
    expect(channelOf(await io.call("GET", ""), "carriage.second.coil_14")).toBeDefined();
    await renameValve("third");
    await renameValve("fourth");
    await renameValve("valve");
    const back = await io.call("GET", "");
    expect(channelOf(back, COIL)).toMatchObject({ variable: "carriage_valve_coil_14" });
    expect(back.answer.status).toBe("valid");
  });

  it("is carried by an edit route, which reads the mapping first", async () => {
    await mapValveAndSetpoint();
    await renameValve("distributeur");
    const call = await io.call("PATCH", `/channels/${NEW_COIL}`, { comment: "ok" });
    expect(call.status).toBe(200);
    expect(channelOf(call, NEW_COIL)?.comment).toBe("ok");
  });

  it("is written by save even if nothing read the mapping since the rename", async () => {
    await mapValveAndSetpoint();
    await save();
    await renameValve("distributeur");
    expect((await save()).status).toBe(200);
    const ioPath = join(io.axis().workspace.pantinsDirectory, "axis", "io.json");
    const saved = IoDocumentSchema.parse(JSON.parse(await readFile(ioPath, "utf8")));
    const names = saved.modules.flatMap((module) => module.channels.map((channel) => channel.tag));
    expect(names).toContain(NEW_COIL);
    expect(names).not.toContain(COIL);
    expect(await unsavedChanges(io.axis())).toBe(false);
  });

  it("leaves nothing unsaved once it is renamed back", async () => {
    await mapValveAndSetpoint();
    await save();
    await renameValve("distributeur");
    await renameValve("valve");
    expect(await unsavedChanges(io.axis())).toBe(false);
  });
});

describe("a deleted tag", () => {
  it("leaves its channel in place as an unknown tag, not removed", async () => {
    await mapValveAndSetpoint();
    expect((await del("/joints/stroke")).status).toBe(200);
    const call = await io.call("GET", "");
    expect(call.answer.status).toBe("invalid");
    expect(channelOf(call, SETPOINT_TAG)).toMatchObject({ tagType: null, owner: null });
    expect(call.answer.problems.map((problem) => problem.code)).toEqual(["unknown_tag"]);
    const removed = await io.call("DELETE", `/channels/${SETPOINT_TAG}`);
    expect(removed.answer.status).toBe("valid");
  });
});

describe("a rename onto the tag of a stale channel", () => {
  it("is not carried: the renamed tag's channel shows unknown_tag", async () => {
    const created = await post("/drives", {
      name: "Second valve",
      assembly: "carriage",
      type: "valve_5_3_closed",
    });
    expect(created.status).toBe(201);
    const known = new Set((await listTags(io.axis())).map((tag) => tag.name));
    await io.addModule();
    const second = (await listTags(io.axis()))
      .map((tag) => tag.name)
      .filter((n) => n.includes("second"));
    expect(second.length).toBeGreaterThan(0);
    await io.mapTags([...second, COIL, OTHER_COIL]);
    expect(known.has(COIL)).toBe(true);
    await del("/drives/valve");
    expect((await io.call("GET", "")).answer.problems.map((p) => p.code)).toContain("unknown_tag");
    const renamed = await sendJsonRequest(
      io.axis().server,
      "PUT",
      "/api/pantins/axis/drives/second-valve/tag-key",
      { tagKey: "valve" },
    );
    expect(renamed.body).toContain("renamedTags");
    const call = await io.call("GET", "");
    // Both stale channels keep their names, which now name the second valve's
    // tags: they adopt them, and the second valve's own channels are stale.
    expect(channelOf(call, COIL)).toMatchObject({ owner: { kind: "drive", id: "second-valve" } });
    expect(call.answer.unmappedTags.map((tag) => tag.name)).not.toContain(COIL);
    for (const name of second) {
      expect(channelOf(call, name)).toMatchObject({ owner: null });
    }
    expect(call.answer.modules[0]?.channels.map((c) => c.tag).sort()).toEqual(
      [...second, COIL, OTHER_COIL].sort(),
    );
  });
});

describe("discard", () => {
  it("resets the aligned document: no rename is carried from the discarded edits", async () => {
    await mapValveAndSetpoint();
    await save();
    await renameValve("distributeur");
    expect(channelOf(await io.call("GET", ""), NEW_COIL)).toBeDefined();
    await discardAxis(io.axis());
    const call = await io.call("GET", "");
    expect(call.answer.status).toBe("valid");
    expect(channelOf(call, COIL)).toBeDefined();
    expect(channelOf(call, NEW_COIL)).toBeUndefined();
    expect(await unsavedChanges(io.axis())).toBe(false);
  });

  it("does not carry a rename made after a discard back onto stale names", async () => {
    await mapValveAndSetpoint();
    await save();
    await renameValve("distributeur");
    await io.call("GET", "");
    await discardAxis(io.axis());
    await renameValve("other");
    const call = await io.call("GET", "");
    expect(channelOf(call, "carriage.other.coil_14")).toBeDefined();
    expect(call.answer.status).toBe("valid");
  });
});
