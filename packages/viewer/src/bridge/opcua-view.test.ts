import type { BridgeFailure, IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { CLIENT_CERTIFICATE, opcuaStatusOf } from "./bridge-fixtures.ts";
import { INITIAL_OPCUA_MODEL, type OpcuaBridgeModel } from "./opcua-model.ts";
import { buildOpcuaView, opcuaModulesOf, opcuaRedrawKey } from "./opcua-view.ts";

const fr = createTranslator("fr");
const en = createTranslator("en");

const MODULES = [
  { key: "plc", port: 4840, userName: null },
  { key: "secure", port: 4841, userName: "operator" },
];

function modelOf(
  status: ReturnType<typeof opcuaStatusOf>,
  targets: Record<string, string> = {},
  pending = false,
): OpcuaBridgeModel {
  return { ...INITIAL_OPCUA_MODEL, status, targets, pending };
}

const SERVER_CERTIFICATE = {
  subject: "CN=plc",
  notBefore: "2026-01-01",
  notAfter: "2036-01-01",
  sha256: "ef".repeat(32),
  sha1: "12".repeat(20),
  reason: "expired",
};

function failedWith(kind: BridgeFailure["kind"], certificate: BridgeFailure["certificate"]) {
  return opcuaStatusOf({
    state: "failed",
    failure: { kind, message: "m", exitCode: 1, signal: null, certificate, module: null },
    clientCertificate: CLIENT_CERTIFICATE,
  });
}

describe("which OPC UA modules the card lists", () => {
  it("takes the OPC UA modules of the mapping, with the user name of a user login", () => {
    const mapping = {
      modules: [
        { key: "mb", transport: { kind: "modbus_tcp_slave", port: 1502 } },
        {
          key: "ua",
          transport: { kind: "opcua_client", port: 4840, auth: { kind: "user", userName: "bob" } },
        },
        {
          key: "ua2",
          transport: { kind: "opcua_client", port: 4841, auth: { kind: "anonymous" } },
        },
      ],
    } as unknown as IoMappingResponse;
    expect(opcuaModulesOf(mapping.modules)).toEqual([
      { key: "ua", port: 4840, userName: "bob" },
      { key: "ua2", port: 4841, userName: null },
    ]);
    expect(opcuaModulesOf(null)).toBeNull();
  });
});

describe("the OPC UA card", () => {
  it("is hidden without a status, and without module while the bridge is stopped", () => {
    expect(buildOpcuaView(INITIAL_OPCUA_MODEL, MODULES, fr)).toBeNull();
    expect(buildOpcuaView(modelOf(opcuaStatusOf()), [], fr)).toBeNull();
    expect(buildOpcuaView(modelOf(opcuaStatusOf({ state: "running" })), [], fr)).not.toBeNull();
  });

  it("has a target per module and a password field for user modules only", () => {
    const view = buildOpcuaView(modelOf(opcuaStatusOf(), { plc: "10.0.0.2" }), MODULES, fr);
    expect(
      view?.moduleLines.map((line) => [line.key, line.target, line.passwordLabel !== null]),
    ).toEqual([
      ["plc", "10.0.0.2", false],
      ["secure", "", true],
    ]);
    expect(view?.moduleLines[1]?.loginText).toBe(
      "Connexion : utilisateur et mot de passe (operator)",
    );
    expect(view?.moduleLines[0]?.loginText).toBe("Connexion : anonyme");
    expect(view?.button).toMatchObject({ kind: "start", enabled: true });
  });

  it("locks the fields while the bridge runs and shows the endpoint the core reports", () => {
    const running = opcuaStatusOf({
      state: "running",
      modules: [
        { key: "plc", endpoint: "opc.tcp://10.0.0.2:4840", plcConnected: true, reason: null },
        {
          key: "secure",
          endpoint: "opc.tcp://10.0.0.2:4841",
          plcConnected: false,
          reason: "node_mismatch",
        },
      ],
    });
    const view = buildOpcuaView(modelOf(running, { plc: "10.0.0.2" }), MODULES, en);
    expect(view?.moduleLines.every((line) => line.targetLocked)).toBe(true);
    expect(
      view?.moduleLines.map((line) => [line.endpoint, line.statusText, line.reasonText]),
    ).toEqual([
      ["opc.tcp://10.0.0.2:4840", "PLC connected", null],
      [
        "opc.tcp://10.0.0.2:4841",
        "waiting for the PLC",
        "the PLC does not have the expected variables",
      ],
    ]);
    expect(view?.button.kind).toBe("stop");
  });

  it("shows Pantin's thumbprints as text, and says so before a first start", () => {
    const withCertificate = buildOpcuaView(
      modelOf(opcuaStatusOf({ clientCertificate: CLIENT_CERTIFICATE })),
      MODULES,
      en,
    );
    expect(withCertificate?.certificate?.thumbprints).toEqual([
      { label: "SHA-256 thumbprint", value: CLIENT_CERTIFICATE.sha256 },
      { label: "SHA-1 thumbprint", value: CLIENT_CERTIFICATE.sha1 },
    ]);
    expect(withCertificate?.certificateHint).toBeNull();
    const before = buildOpcuaView(modelOf(opcuaStatusOf()), MODULES, en);
    expect(before?.certificate).toBeNull();
    expect(before?.certificateHint).toContain("first start");
  });

  it("explains a certificate the PLC refused, with the thumbprints, and that Pantin retries", () => {
    const status = opcuaStatusOf({
      state: "running",
      clientCertificate: CLIENT_CERTIFICATE,
      modules: [{ key: "plc", endpoint: "e", plcConnected: false, reason: "certificate_rejected" }],
    });
    const notice = buildOpcuaView(modelOf(status), MODULES, en)?.rejectionNotice;
    expect(notice).toContain(CLIENT_CERTIFICATE.sha1);
    expect(notice).toContain(CLIENT_CERTIFICATE.sha256);
    expect(notice).toContain("retries every 10 s");
  });

  it("asks to trust an unknown PLC certificate, showing its subject and both thumbprints", () => {
    const view = buildOpcuaView(
      modelOf(failedWith("untrusted_server_certificate", SERVER_CERTIFICATE)),
      MODULES,
      fr,
    );
    expect(view?.trustPrompt).toMatchObject({
      buttonLabel: "Faire confiance et redémarrer",
      subjectLine: "Sujet : CN=plc",
      sha256: SERVER_CERTIFICATE.sha256,
      enabled: true,
    });
    expect(view?.trustPrompt?.thumbprints.map((found) => found.value)).toEqual([
      SERVER_CERTIFICATE.sha256,
      SERVER_CERTIFICATE.sha1,
    ]);
    expect(
      buildOpcuaView(
        modelOf(failedWith("untrusted_server_certificate", SERVER_CERTIFICATE), {}, true),
        MODULES,
        fr,
      )?.trustPrompt?.enabled,
    ).toBe(false);
  });

  it("never offers to trust any other failure, and explains them in words", () => {
    const invalid = buildOpcuaView(
      modelOf(failedWith("server_certificate_invalid", SERVER_CERTIFICATE)),
      MODULES,
      en,
    );
    expect(invalid?.trustPrompt).toBeNull();
    expect(invalid?.failureExplanation).toContain("never trusts an expired certificate");
    expect(invalid?.failureExplanation).toContain("Reason: expired");
    const login = buildOpcuaView(modelOf(failedWith("authentication_failed", null)), MODULES, en);
    expect(login?.failureExplanation).toContain("refused the login");
    expect(
      buildOpcuaView(modelOf(failedWith("crashed", null)), MODULES, en)?.failureExplanation,
    ).toBeNull();
  });

  it("says why it cannot start", () => {
    expect(
      buildOpcuaView(modelOf(opcuaStatusOf({ availability: "unavailable" })), MODULES, en),
    ).toMatchObject({
      notice: expect.stringContaining("--opcua-bridge"),
      button: { enabled: false },
    });
  });

  it("does not redraw for a typed target, so that a click is not lost", () => {
    const first = buildOpcuaView(modelOf(opcuaStatusOf(), { plc: "10.0.0.2" }), MODULES, en);
    const second = buildOpcuaView(modelOf(opcuaStatusOf(), { plc: "10.0.0.20" }), MODULES, en);
    expect(first && second && opcuaRedrawKey(first) === opcuaRedrawKey(second)).toBe(true);
  });
});
