import { describe, expect, it } from "vitest";
import {
  COIL,
  channelOf,
  OTHER_COIL,
  POSITION_TAG,
  SETPOINT_TAG,
  useIoAxis,
} from "../test-support/io-edits.ts";
import { loadIo } from "../test-support/io-files.ts";

// POST .../io/modules/:moduleKey/channels and PATCH, DELETE .../io/channels/:tag
// (ADR 0049 point 4).

const io = useIoAxis();

describe("POST .../io/modules/:moduleKey/channels", () => {
  it("maps each tag with its zone, type, variable and proposed address", async () => {
    await io.addModule();
    const call = await io.mapTags([COIL, OTHER_COIL, SETPOINT_TAG]);
    expect(call.status).toBe(200);
    expect(call.answer.status).toBe("valid");
    expect(channelOf(call, COIL)).toMatchObject({
      variable: "carriage_valve_coil_14",
      zone: "coil",
      address: 0,
      ioType: "BOOL",
      comment: "",
      tagType: "bit",
      direction: "command",
      owner: { kind: "drive", id: "valve" },
    });
    expect(channelOf(call, OTHER_COIL)).toMatchObject({ zone: "coil", address: 1 });
    expect(channelOf(call, SETPOINT_TAG)).toMatchObject({
      zone: "holding_register",
      address: 0,
      ioType: "REAL",
    });
    expect(call.answer.unmappedTags.map((tag) => tag.name)).not.toContain(COIL);
  });

  it("proposes the lowest free address after a channel was deleted", async () => {
    await io.addModule();
    await io.mapTags([COIL, OTHER_COIL]);
    await io.call("DELETE", `/channels/${COIL}`);
    expect(channelOf(await io.mapTags([COIL]), COIL)?.address).toBe(0);
  });

  it("suffixes a variable that another channel already uses, ignoring case", async () => {
    await io.addModule();
    await io.mapTags([COIL]);
    await io.call("PATCH", `/channels/${COIL}`, { variable: "CARRIAGE_VALVE_COIL_12" });
    const call = await io.mapTags([OTHER_COIL]);
    expect(channelOf(call, OTHER_COIL)?.variable).toBe("carriage_valve_coil_12_2");
  });
});

describe("POST .../io/modules/:moduleKey/channels refusals", () => {
  it("answers 400 for a tag the document does not have, and maps nothing", async () => {
    await io.addModule();
    const call = await io.mapTags([COIL, "carriage.ghost.coil"]);
    expect(call.status).toBe(400);
    expect(call.text).toContain("carriage.ghost.coil");
    expect((await io.call("GET", "")).answer.modules[0]?.channels).toEqual([]);
  });

  it("answers 409 for a tag already mapped, and maps nothing", async () => {
    await io.addModule();
    await io.addModule();
    await io.mapTags([COIL]);
    const call = await io.mapTags([OTHER_COIL, COIL], "m2");
    expect(call.status).toBe(409);
    expect((await io.call("GET", "")).answer.modules[1]?.channels).toEqual([]);
  });

  it("answers 404 for an unknown module", async () => {
    await io.addModule();
    expect((await io.mapTags([COIL], "ghost")).status).toBe(404);
  });

  it("answers 400 for an empty, repeated or invalid list", async () => {
    await io.addModule();
    expect((await io.mapTags([])).status).toBe(400);
    expect((await io.mapTags([COIL, COIL])).status).toBe(400);
    expect((await io.call("POST", "/modules/m1/channels", { tag: COIL })).status).toBe(400);
    expect((await io.mapTags(["Bad Name"])).status).toBe(400);
  });
});

// A coil mapped in a discrete input zone: a document change could cause this.
function zoneMismatch() {
  const channel = {
    tag: COIL,
    variable: "x",
    zone: "discrete_input",
    address: 4,
    ioType: "BOOL",
    comment: "",
  };
  const settings = { unitId: 1, wordOrder: "low_word_first", watchdogMilliseconds: 1000 };
  return {
    schema_version: 1,
    modules: [{ key: "m1", port: 1502, ...settings, channels: [channel] }],
  };
}

async function twoModulesWithChannels() {
  await io.addModule();
  await io.addModule();
  await io.mapTags([COIL, OTHER_COIL, SETPOINT_TAG]);
}

describe("PATCH .../io/channels/:tag", () => {
  it("edits the variable, the address and the comment, as sent", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${COIL}`, {
      variable: "extend",
      address: 5,
      comment: "valve A",
    });
    expect(call.status).toBe(200);
    expect(channelOf(call, COIL)).toMatchObject({
      variable: "extend",
      address: 5,
      comment: "valve A",
    });
  });

  it("keeps an explicit address that overlaps, and shows it as a problem", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${COIL}`, { address: 1 });
    expect(call.status).toBe(200);
    expect(call.answer.status).toBe("invalid");
    expect(call.answer.problems.map((problem) => problem.code)).toContain("address_overlap");
  });

  it("proposes an address in the target module when the channel moves", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${OTHER_COIL}`, { module: "m2" });
    expect(call.status).toBe(200);
    expect(call.answer.modules[0]?.channels.map((channel) => channel.tag)).not.toContain(
      OTHER_COIL,
    );
    expect(call.answer.modules[1]?.channels).toMatchObject([{ tag: OTHER_COIL, address: 0 }]);
  });

  it("keeps the explicit address of a move", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${OTHER_COIL}`, { module: "m2", address: 9 });
    expect(call.answer.modules[1]?.channels).toMatchObject([{ tag: OTHER_COIL, address: 9 }]);
  });
});

describe("PATCH .../io/channels/:tag address and tag", () => {
  it("keeps the address when only the comment changes", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${OTHER_COIL}`, { comment: "x" });
    expect(channelOf(call, OTHER_COIL)?.address).toBe(1);
  });

  it("derives zone and type again from a new tag, and proposes an address in the new zone", async () => {
    await twoModulesWithChannels();
    const call = await io.call("PATCH", `/channels/${COIL}`, { tag: POSITION_TAG });
    expect(call.status).toBe(200);
    expect(channelOf(call, POSITION_TAG)).toMatchObject({
      zone: "input_register",
      ioType: "REAL",
      address: 0,
      variable: "carriage_valve_coil_14",
    });
    expect(channelOf(call, COIL)).toBeUndefined();
  });

  it("repairs a zone that no longer matches when the tag is sent unchanged", async () => {
    await loadIo(io.axis(), JSON.stringify(zoneMismatch()));
    const before = await io.call("GET", "");
    expect(before.answer.problems.map((problem) => problem.code)).toContain(
      "zone_direction_mismatch",
    );
    const call = await io.call("PATCH", `/channels/${COIL}`, { tag: COIL });
    expect(call.answer.problems).toEqual([]);
    expect(channelOf(call, COIL)).toMatchObject({ zone: "coil", ioType: "BOOL", address: 0 });
  });
});

describe("PATCH .../io/channels/:tag refusals", () => {
  it("answers 404 for a tag that is not mapped", async () => {
    await twoModulesWithChannels();
    expect((await io.call("PATCH", "/channels/carriage.ghost.coil", {})).status).toBe(404);
  });

  it("answers 400 for an unknown tag or module, and for an invalid body", async () => {
    await twoModulesWithChannels();
    const path = `/channels/${COIL}`;
    expect((await io.call("PATCH", path, { tag: "carriage.ghost.coil" })).status).toBe(400);
    expect((await io.call("PATCH", path, { module: "ghost" })).status).toBe(400);
    expect((await io.call("PATCH", path, { zone: "coil" })).status).toBe(400);
    expect((await io.call("PATCH", path, { address: -1 })).status).toBe(400);
  });

  it("answers 409 for a new tag that is already mapped", async () => {
    await twoModulesWithChannels();
    expect((await io.call("PATCH", `/channels/${COIL}`, { tag: OTHER_COIL })).status).toBe(409);
  });
});

describe("DELETE .../io/channels/:tag", () => {
  it("unmaps a tag, which comes back in the unmapped list", async () => {
    await twoModulesWithChannels();
    const call = await io.call("DELETE", `/channels/${COIL}`);
    expect(call.status).toBe(200);
    expect(channelOf(call, COIL)).toBeUndefined();
    expect(call.answer.unmappedTags.map((tag) => tag.name)).toContain(COIL);
  });

  it("answers 404 for a tag that is not mapped", async () => {
    await twoModulesWithChannels();
    expect((await io.call("DELETE", "/channels/carriage.ghost.coil")).status).toBe(404);
  });
});
