import type { Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { sourceOf } from "../test-fixtures.ts";
import { documentStateTags } from "./device-families.ts";
import { devicePantin } from "./device-fixtures.ts";
import { stateMarkOf, stateMarksKey } from "./device-state.ts";
import { deviceRowId } from "./node-ids.ts";
import { buildTree, findNode } from "./tree-model.ts";

// The on or off mark of a sensor row (ADR 0047 point 3, slice P2).

const encoder: Sensor = {
  id: "enc",
  tagKey: "enc",
  name: "Encoder",
  assembly: "main",
  joint: "spin",
  type: "encoder",
  pulsesPerUnit: 100,
};

describe("stateMarkOf", () => {
  it("is on from 0.5 and off below", () => {
    const values = new Map([
      ["a.x.on", 1],
      ["a.x.off", 0],
      ["a.x.half", 0.5],
    ]);
    expect(stateMarkOf("a.x.on", values)).toBe("on");
    expect(stateMarkOf("a.x.off", values)).toBe("off");
    expect(stateMarkOf("a.x.half", values)).toBe("on");
  });

  it("is none while the tag is not polled yet, and for a type without a state tag", () => {
    expect(stateMarkOf("a.x.on", new Map())).toBeNull();
    expect(stateMarkOf(null, new Map([["a.x.on", 1]]))).toBeNull();
  });
});

describe("the marks in the tree", () => {
  const pantin = devicePantin();
  const withEncoder = {
    ...pantin,
    document: { ...pantin.document, sensors: [...pantin.document.sensors, encoder] },
  };
  const [switchTag, cellTag] = documentStateTags(withEncoder.document);
  const english = createTranslator("en");

  function nodeOf(kind: "sensor" | "presenceSensor", id: string, values: Map<string, number>) {
    const tree = buildTree(sourceOf({ openPantin: withEncoder, tagValues: values }), english);
    return findNode(tree, deviceRowId("press", kind, id));
  }

  it("lists the state tags of the sensors that have one, not of the encoder", () => {
    expect(switchTag).toMatch(/^main\.end\./);
    expect(cellTag).toMatch(/^main\.cell\./);
    expect(documentStateTags(withEncoder.document)).toHaveLength(2);
  });

  it("marks a joint sensor and a presence sensor on or off, with the state in words", () => {
    const values = new Map([
      [switchTag ?? "", 1],
      [cellTag ?? "", 0],
    ]);
    expect(nodeOf("sensor", "end", values)).toMatchObject({ stateMark: "on", stateLabel: "On" });
    expect(nodeOf("presenceSensor", "cell", values)).toMatchObject({
      stateMark: "off",
      stateLabel: "Off",
    });
  });

  it("shows no mark for a value not polled yet, nor for an encoder", () => {
    expect(nodeOf("sensor", "end", new Map())).toMatchObject({ stateMark: null, stateLabel: null });
    const polled = new Map([[switchTag ?? "", 1]]);
    expect(nodeOf("sensor", "enc", polled)).toMatchObject({ stateMark: null, stateLabel: null });
  });

  it("says the state in French", () => {
    const tree = buildTree(
      sourceOf({ openPantin: withEncoder, tagValues: new Map([[switchTag ?? "", 0]]) }),
      createTranslator("fr"),
    );
    expect(findNode(tree, deviceRowId("press", "sensor", "end"))?.stateLabel).toBe("Désactivé");
  });

  it("changes its key only when a mark flips", () => {
    const document = withEncoder.document;
    const key = (value: number) => stateMarksKey(document, new Map([[switchTag ?? "", value]]));
    expect(key(1)).toBe(key(0.8));
    expect(key(1)).not.toBe(key(0));
    expect(stateMarksKey(document, new Map())).not.toBe(key(1));
  });
});
