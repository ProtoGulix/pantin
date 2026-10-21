import { describe, expect, it } from "vitest";
import { TRANSPORT_LABELS } from "./labels.ts";
import { TRANSPORT_PRESENTATION } from "./presentation.ts";
import { TRANSPORT_RULES } from "./rules.ts";
import {
  CHANNEL_KEY_BY_KIND,
  CHANNEL_KEYS,
  CHANNEL_PATCH_TRANSPORT_SHAPE,
  CHANNEL_TRANSPORT_SHAPE,
  TRANSPORT_KINDS,
  TransportConfigSchema,
  TransportPatchSchema,
} from "./schemas.ts";

// Every transport kind is complete in every registry (ADR 0064 point 16): a new
// folder that forgets one registry fails here, not at run time.

describe.each(TRANSPORT_KINDS)("transport %s", (kind) => {
  it("has rules, presentation and labels in both languages under its own kind", () => {
    expect(TRANSPORT_RULES[kind].kind).toBe(kind);
    expect(TRANSPORT_PRESENTATION[kind].kind).toBe(kind);
    for (const language of ["en", "fr"] as const) {
      const labels = TRANSPORT_LABELS[kind][language];
      expect(labels.name).not.toBe("");
      expect(Object.values(labels.settings).every((text) => text !== "")).toBe(true);
      expect(Object.values(labels.channelFields).every((text) => text !== "")).toBe(true);
    }
  });

  it("says whether its bridge listens or connects, and lists only its own modules", () => {
    const rules = TRANSPORT_RULES[kind];
    expect(["listens", "connects"]).toContain(rules.network);
    const settings = rules.createTransport({ kind }, []);
    if (typeof settings === "string") {
      throw new Error(settings);
    }
    const own = { key: "own", transport: settings, channels: [] };
    const facts = rules.bridgeModules([own]);
    expect(facts.map((fact) => fact.key)).toEqual(["own"]);
    expect(facts.every((fact) => (fact.port === null) === (rules.network === "connects"))).toBe(
      true,
    );
  });

  it("has the same label keys in both languages", () => {
    const { en, fr } = TRANSPORT_LABELS[kind];
    expect(Object.keys(fr.settings).sort()).toEqual(Object.keys(en.settings).sort());
    expect(Object.keys(fr.channelFields).sort()).toEqual(Object.keys(en.channelFields).sort());
    expect(Object.keys(fr.values).sort()).toEqual(Object.keys(en.values).sort());
  });

  it("names the channel sub-object in the shapes of the schema and of the edit requests", () => {
    const key = CHANNEL_KEY_BY_KIND[kind];
    expect(CHANNEL_KEYS).toContain(key);
    expect(Object.keys(CHANNEL_TRANSPORT_SHAPE)).toContain(key);
    expect(Object.keys(CHANNEL_PATCH_TRANSPORT_SHAPE)).toContain(key);
  });

  it("has its kind in the transport schema and in the edit request schema", () => {
    expect(TransportPatchSchema.safeParse({ kind }).success).toBe(true);
    const created = TransportPatchSchema.parse({ kind });
    const settings = TRANSPORT_RULES[kind].createTransport(created, []);
    expect(TransportConfigSchema.safeParse(settings).success).toBe(true);
  });

  it("gives its own kind back from the rules of a transport it created", () => {
    const settings = TRANSPORT_RULES[kind].createTransport({ kind }, []);
    expect(typeof settings === "string" ? settings : settings.kind).toBe(kind);
  });
});

describe("the registries together", () => {
  it("list the same kinds", () => {
    const kinds = [...TRANSPORT_KINDS].sort();
    expect(Object.keys(TRANSPORT_RULES).sort()).toEqual(kinds);
    expect(Object.keys(TRANSPORT_PRESENTATION).sort()).toEqual(kinds);
    expect(Object.keys(TRANSPORT_LABELS).sort()).toEqual(kinds);
    expect(Object.keys(CHANNEL_KEY_BY_KIND).sort()).toEqual(kinds);
  });

  it("refuse a kind nobody registered", () => {
    expect(TransportConfigSchema.safeParse({ kind: "carrier_pigeon", port: 1502 }).success).toBe(
      false,
    );
    expect(TransportPatchSchema.safeParse({ kind: "carrier_pigeon" }).success).toBe(false);
  });
});
