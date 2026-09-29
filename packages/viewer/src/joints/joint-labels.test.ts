import { JOINT_PARAMETERS } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { LANGUAGES, LOCALE_CATALOGS } from "../i18n/translate.ts";
import { JOINT_TYPES, jointTypeLabelKey, parameterLabelKey } from "./joint-labels.ts";

describe("joint labels", () => {
  it("lists every joint type of the protocol", () => {
    expect([...JOINT_TYPES].sort()).toEqual(Object.keys(JOINT_PARAMETERS).sort());
  });

  it.each(LANGUAGES)("%s has a label for every joint type", (language) => {
    for (const type of JOINT_TYPES) {
      expect(LOCALE_CATALOGS[language][jointTypeLabelKey(type)]).toBeTruthy();
    }
  });

  it.each(LANGUAGES)("%s has a label for every declared parameter field", (language) => {
    for (const parameters of Object.values(JOINT_PARAMETERS)) {
      for (const parameter of parameters) {
        expect(LOCALE_CATALOGS[language][parameterLabelKey(parameter.field)]).toBeTruthy();
      }
    }
  });

  it("reports an undeclared field loudly instead of showing nothing", () => {
    expect(() => parameterLabelKey("no-such-field")).toThrow("no-such-field");
  });
});
