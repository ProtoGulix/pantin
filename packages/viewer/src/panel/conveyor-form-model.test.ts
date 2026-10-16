import { describe, expect, it } from "vitest";
import { conveyorPantin, feedBelt } from "../conveyors/conveyor-fixtures.ts";
import { initialConveyorForm } from "../conveyors/conveyor-form.ts";
import { createTranslator } from "../i18n/translate.ts";
import { railBody } from "../test-fixtures.ts";
import { initialViewerState, type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildConveyorFormView } from "./conveyor-form-model.ts";

const pantin = conveyorPantin();
const { document } = pantin;

function viewOf(kind: Parameters<typeof initialConveyorForm>[0], language: "fr" | "en" = "fr") {
  const state: ViewerState = {
    ...withOpenPantin(initialViewerState(language), pantin),
    conveyorForm: initialConveyorForm(kind, document),
  };
  return buildConveyorFormView(state, document, createTranslator(language));
}

describe("the object form view", () => {
  it("is absent while no form is open", () => {
    const state = withOpenPantin(initialViewerState("fr"), pantin);
    expect(buildConveyorFormView(state, document, createTranslator("fr"))).toBeNull();
  });

  it("titles a creation with the kind, and offers the placement in millimetres and degrees", () => {
    const view = viewOf("belt");
    expect(view?.title).toBe("Création : Bande");
    expect(view?.placementInputs.map((input) => input.label)).toEqual([
      "X (mm)",
      "Y (mm)",
      "Z (mm)",
      "RX (°)",
      "RY (°)",
      "RZ (°)",
    ]);
  });

  it("gives a belt its sizes in millimetres and a drum picker limited to continuous joints", () => {
    const inputs = viewOf("belt")?.inputs ?? [];
    expect(inputs.map((input) => input.label)).toEqual([
      "Longueur (mm)",
      "Largeur (mm)",
      "Rayon du tambour (mm)",
      "Tambour (liaison pivot continu)",
    ]);
    const drum = inputs.find((input) => input.key === "drumJoint");
    expect([drum?.input, drum?.options]).toEqual(["select", [{ value: "spin", label: "Spin" }]]);
  });
});

describe("the inputs of each kind", () => {
  it("gives an emitter a mass in kilograms and the eight materials", () => {
    const inputs = viewOf("emitter")?.inputs ?? [];
    expect(inputs.find((input) => input.key === "mass")?.label).toBe("Masse (kg)");
    const material = inputs.find((input) => input.key === "material");
    expect(material?.options).toHaveLength(8);
    expect(material?.options[0]).toEqual({ value: "cardboard", label: "Carton" });
  });

  it("builds a cell's inputs from its type: range in mm, delays in ms, NO/NC as a flag", () => {
    const view = viewOf("presenceSensor");
    const labelled = Object.fromEntries(
      (view?.inputs ?? []).map((i) => [i.key, [i.label, i.input]]),
    );
    expect(labelled).toEqual({
      mode: ["Mode", "select"],
      range: ["Portée (mm)", "text"],
      normallyClosed: ["Normalement fermé", "checkbox"],
      onDelay: ["Retard à l'enclenchement (ms)", "text"],
      offDelay: ["Retard au déclenchement (ms)", "text"],
    });
    expect(view?.typeOptions).toEqual([
      { value: "photoelectric", label: "Cellule photoélectrique" },
    ]);
  });

  it("translates the same form into English", () => {
    const view = viewOf("presenceSensor", "en");
    expect(view?.inputs.find((input) => input.key === "range")?.label).toBe("Range (mm)");
    expect(view?.inputs.find((input) => input.key === "mode")?.options).toEqual([
      { value: "diffuse", label: "Diffuse" },
      { value: "through_beam", label: "Through-beam" },
    ]);
  });

  it("limits the body picker to the bodies of the chosen assembly, after a 'none' choice", () => {
    const withOther = {
      ...document,
      assemblies: [
        ...document.assemblies,
        { key: "other", name: "Other", placement: feedBelt.placement },
      ],
      bodies: [...document.bodies, { ...railBody, id: "far", name: "Far", assembly: "other" }],
    };
    const state: ViewerState = {
      ...withOpenPantin(initialViewerState("fr"), { ...pantin, document: withOther }),
      conveyorForm: { ...initialConveyorForm("guide", withOther), assembly: "other" },
    };
    const view = buildConveyorFormView(state, withOther, createTranslator("fr"));
    expect(view?.bodyOptions).toEqual([
      { value: "", label: "Aucun : repère de l'assemblage" },
      { value: "far", label: "Far" },
    ]);
  });
});
