import type { PantinDocument, Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { buildContextMenuView } from "../panel/context-menu-model.ts";
import { buildSensorFormView } from "../panel/sensor-form-model.ts";
import {
  hingeJoint,
  pantinResponse,
  railBody,
  slideJoint,
  spinJoint,
  stepBody,
} from "../test-fixtures.ts";
import { jointNodeId } from "../tree/node-ids.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { endSwitchRequests, sensorFormForJoint } from "./joint-sensors.ts";
import {
  buildSensorRequest,
  sensorFormFor,
  withSensorFormJoint,
  withSensorFormType,
  withSensorFormValue,
} from "./sensor-form.ts";

// The sensors of the inspector (ADR 0023): the form in display units,
// the end-of-stroke switches, and what the joint's context menu offers.

const extended: Sensor = {
  id: "extended",
  tagKey: "extended",
  name: "Extended",
  assembly: "main",
  joint: "slide",
  type: "position_switch",
  range: [0.098, 0.1],
  normallyClosed: true,
};

const response = pantinResponse(false, [railBody, stepBody("carriage", "Carriage")], "press", [
  slideJoint,
  hingeJoint,
  spinJoint,
]);
const document: PantinDocument = { ...response.document, sensors: [extended] };
const t = createTranslator("fr");

// The form the joint's context menu opens; failing here, not later, if it has none.
function formForJoint(jointId: string) {
  const form = sensorFormForJoint(document, jointId);
  if (form === null) {
    throw new Error(`No sensor form for joint "${jointId}".`);
  }
  return form;
}

describe("sensor form", () => {
  it("prefills a switch in mm and sends it back in metres", () => {
    const form = sensorFormFor(extended, document);
    expect(form.values).toEqual({
      "range.lower": "98",
      "range.upper": "100",
      normallyClosed: "true",
    });
    expect(buildSensorRequest(withSensorFormValue(form, "range.lower", "95"), document)).toEqual({
      ok: true,
      request: { ...extended, id: undefined, tagKey: undefined, range: [0.095, 0.1] },
    });
  });

  it("types an encoder's resolution in pulses per degree on a pivot", () => {
    let form = withSensorFormType(formForJoint("hinge"), "encoder");
    form = withSensorFormValue(form, "pulsesPerUnit", "10");
    const built = buildSensorRequest(form, document);
    expect(built.ok && Reflect.get(built.request, "pulsesPerUnit")).toBeCloseTo(1800 / Math.PI);
  });

  it("types a range in degrees on a pivot, and sends an unticked flag as false", () => {
    let form = withSensorFormValue(formForJoint("hinge"), "range.lower", "85");
    form = withSensorFormValue(form, "range.upper", "90");
    const built = buildSensorRequest(form, document);
    expect(built.ok && built.request).toMatchObject({ joint: "hinge", normallyClosed: false });
    const range: unknown = built.ok ? Reflect.get(built.request, "range") : null;
    expect(Array.isArray(range) && range[1]).toBeCloseTo(Math.PI / 2);
  });

  it("empties the parameters when the joint changes unit, and keeps them otherwise", () => {
    const form = sensorFormFor(extended, document);
    expect(withSensorFormJoint(form, "hinge", document).values).toEqual({
      normallyClosed: "false",
    });
    expect(withSensorFormJoint(form, "slide", document).values).toEqual(form.values);
  });

  it("reports the schema's message for reversed bounds", () => {
    const form = withSensorFormValue(sensorFormFor(extended, document), "range.lower", "120");
    expect(buildSensorRequest(form, document)).toEqual({
      ok: false,
      message: expect.stringMatching(/lower bound/),
    });
  });
});

describe("end-of-stroke switches", () => {
  it("puts a mechanical limit switch 2 % of the stroke before each end (ADR 0025)", () => {
    const [lower, upper] = endSwitchRequests(document, "slide");
    expect(lower).toEqual({
      name: "Slide min",
      assembly: "main",
      joint: "slide",
      type: "limit_switch",
      operatingPosition: 0.002,
      differentialTravel: 0.0005,
      overtravel: 0.002,
      normallyClosed: false,
    });
    expect(upper).toMatchObject({ name: "Slide max" });
    expect(Reflect.get(upper ?? {}, "operatingPosition")).toBeCloseTo(0.098, 12);
  });

  it("offers none on a joint without limits", () => {
    expect(endSwitchRequests(document, "spin")).toEqual([]);
  });
});

describe("sensor section and context menu", () => {
  const state = withOpenPantin(initialViewerState("fr"), { ...response, document });

  it("offers a choice parameter as a select with its labelled options", () => {
    const form = withSensorFormType(formForJoint("slide"), "inductive_switch");
    const view = buildSensorFormView({ ...state, sensorForm: form }, document, t);
    const material = view?.inputs.find((input) => input.key === "material");
    expect([material?.input, material?.value, material?.options[2]]).toEqual([
      "select",
      "steel",
      { value: "brass", label: "Laiton (× 0,4)" },
    ]);
    expect(view?.inputs.find((input) => input.key === "hysteresisPercent")?.label).toBe(
      "Hystérésis (%)",
    );
  });

  it("offers a sensor on a movable joint, and end switches only when it has limits", () => {
    const entriesOf = (jointId: string) => {
      const menu = { nodeId: jointNodeId("press", jointId), x: 0, y: 0 };
      return buildContextMenuView({ ...state, contextMenu: menu }, t)?.entries.map(
        (entry) => entry.label,
      );
    };
    expect(entriesOf("slide")).toEqual(
      expect.arrayContaining(["Ajouter un capteur…", "Ajouter les fins de course"]),
    );
    expect(entriesOf("spin")).toContain("Ajouter un capteur…");
    expect(entriesOf("spin")).not.toContain("Ajouter les fins de course");
  });
});
