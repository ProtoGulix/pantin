import { BRIDGE_FAILURE_KINDS, type BridgeFailure, type BridgeFailureKind } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { layoutOf } from "../central-layout.ts";
import { createTranslator, LANGUAGES } from "../i18n/translate.ts";
import { FAILED_STATUS } from "./bridge-fixtures.ts";
import { bridgeAfterStatus, INITIAL_BRIDGE_MODEL } from "./bridge-model.ts";
import { buildBridgeView } from "./bridge-view.ts";

function modelOf(status: Parameters<typeof bridgeAfterStatus>[1]) {
  return bridgeAfterStatus(INITIAL_BRIDGE_MODEL, status);
}

function viewOf(status: Parameters<typeof bridgeAfterStatus>[1]) {
  const view = buildBridgeView(modelOf(status), createTranslator("fr"), layoutOf("3d"));
  if (view === null) {
    throw new Error("Expected a view.");
  }
  return view;
}

function failureOf(kind: BridgeFailureKind): BridgeFailure {
  return { kind, message: "m", exitCode: null, signal: null, certificate: null, module: null };
}

describe("a failed bridge", () => {
  it("shows the headline, the bridge's message and its log", () => {
    expect(viewOf(FAILED_STATUS).failure).toEqual({
      headline: "Le pont refuse sa configuration",
      message: "port 1502 is taken",
      warning: false,
      details: [],
      logTitle: "Journal du pont",
      log: ["pantin-bridge: port 1502 is taken"],
    });
  });

  it("translates every failure kind, in both languages", () => {
    for (const language of LANGUAGES) {
      const headlines = BRIDGE_FAILURE_KINDS.map((kind) => {
        const model = modelOf({ ...FAILED_STATUS, failure: failureOf(kind) });
        return buildBridgeView(model, createTranslator(language), layoutOf("3d"))?.failure
          ?.headline;
      });
      expect(
        headlines.every((headline) => headline !== undefined && !headline.startsWith("bridge.")),
      ).toBe(true);
      expect(new Set(headlines).size).toBe(BRIDGE_FAILURE_KINDS.length);
    }
  });

  it("names the module and the certificate fingerprint of a failure", () => {
    const certificate = {
      subject: "CN=plc",
      notBefore: "2026-01-01",
      notAfter: "2027-01-01",
      sha256: "AB:CD",
      sha1: "12:34",
      reason: "self signed",
    };
    const failure = { ...failureOf("untrusted_server_certificate"), certificate, module: "m1" };
    expect(viewOf({ ...FAILED_STATUS, failure }).failure?.details).toEqual([
      "Module : m1",
      "Certificat SHA-256 : AB:CD",
    ]);
  });

  it("shows no detail when the failure names neither module nor certificate", () => {
    expect(viewOf(FAILED_STATUS).failure?.details).toEqual([]);
  });

  it("shows an I/O change as a warning", () => {
    const failure = failureOf("mapping_changed");
    expect(viewOf({ ...FAILED_STATUS, failure }).failure?.warning).toBe(true);
  });

  it("shows no failure block without a failure", () => {
    expect(viewOf({ ...FAILED_STATUS, failure: null }).failure).toBeNull();
  });
});
