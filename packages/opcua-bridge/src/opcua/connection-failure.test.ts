import { describe, expect, it } from "vitest";
import { classifyConnectionFailure } from "./connection-failure.ts";

// The messages are the ones node-opcua 2.186 produced in the tests of this package.
const classify = (message: string, secure = true) =>
  classifyConnectionFailure(new Error(message), secure).kind;

describe("classifyConnectionFailure", () => {
  it("tells an untrusted server certificate from a refused one", () => {
    expect(
      classify(
        "server Certificate verification failed with err BadCertificateUntrusted (0x801a0000)",
      ),
    ).toBe("server_certificate_untrusted");
    expect(
      classify(
        "server Certificate verification failed with err BadCertificateTimeInvalid (0x80140000)",
      ),
    ).toBe("server_certificate_refused");
  });

  it("reads a server that refuses Pantin's certificate, only on a secure channel", () => {
    const message =
      "The connection has been rejected by server: BadSecurityChecksFailed (0x80130000)";

    expect(classify(message)).toBe("client_certificate_refused");
    expect(classify(message, false)).toBe("other");
  });

  it.each([
    "BadUserAccessDenied (0x801f0000)",
    "BadIdentityTokenRejected (0x80210000)",
    "Cannot find ANONYMOUS user token policy in end point description",
    "Cannot find USERNAME user token policy in end point description",
  ])("reads %s as a refused login", (message) => {
    expect(classify(message)).toBe("login_refused");
  });

  it("leaves a network failure to the retry loop", () => {
    expect(classify("connect ECONNREFUSED 127.0.0.1:4840")).toBe("other");
    expect(classifyConnectionFailure("not an error", true).kind).toBe("other");
  });
});
