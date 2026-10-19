import { describe, expect, it } from "vitest";
import { CLOSED_ABOUT } from "../about-state.ts";
import { createTranslator } from "../i18n/translate.ts";
import { buildAboutView, versionAgreement } from "./about-model.ts";

describe("versionAgreement", () => {
  it("is pending while the core is being asked", () => {
    expect(versionAgreement("0.2.0", { status: "loading" })).toBe("pending");
  });

  it("is unreachable when the core did not answer", () => {
    expect(versionAgreement("0.2.0", { status: "unreachable" })).toBe("unreachable");
  });

  it("is the same only for the exact same build version", () => {
    expect(versionAgreement("0.2.0", { status: "known", version: "0.2.0" })).toBe("same");
    expect(versionAgreement("0.2.0+abc1234", { status: "known", version: "0.2.0" })).toBe(
      "different",
    );
    expect(versionAgreement("0.2.0+abc1234", { status: "known", version: "0.2.0+def5678" })).toBe(
      "different",
    );
  });
});

describe("buildAboutView", () => {
  const french = createTranslator("fr");
  const open = (core: (typeof CLOSED_ABOUT)["core"]) => ({ open: true, core });

  it("is hidden while closed", () => {
    expect(buildAboutView(CLOSED_ABOUT, "fr", french, "1.0.0").visible).toBe(false);
  });

  it("says the core is loading, then shows its version without a warning", () => {
    const loading = buildAboutView(open({ status: "loading" }), "fr", french, "1.0.0");
    expect(loading.coreText).toBe(french("about.core.loading"));
    expect(loading.mismatch).toBeNull();
    const known = buildAboutView(
      open({ status: "known", version: "1.0.0" }),
      "fr",
      french,
      "1.0.0",
    );
    expect(known.coreText).toBe("1.0.0");
    expect(known.mismatch).toBeNull();
  });

  it("says when the core is unreachable, without claiming a mismatch", () => {
    const view = buildAboutView(open({ status: "unreachable" }), "fr", french, "1.0.0");
    expect(view.coreText).toBe(french("about.core.unreachable"));
    expect(view.mismatch).toBeNull();
  });

  it("warns with both versions when they differ, in the viewer's language", () => {
    const state = open({ status: "known", version: "1.0.1" });
    const fr = buildAboutView(state, "fr", french, "1.0.0");
    expect(fr.mismatch).toContain("1.0.0");
    expect(fr.mismatch).toContain("1.0.1");
    expect(fr.mismatch).toContain("Ctrl+Maj+R");
    expect(buildAboutView(state, "en", createTranslator("en"), "1.0.0").mismatch).toContain(
      "Ctrl+Shift+R",
    );
  });

  it("links the guide in the viewer's language and the repository", () => {
    const fr = buildAboutView(CLOSED_ABOUT, "fr", french, "1.0.0").links;
    const en = buildAboutView(CLOSED_ABOUT, "en", createTranslator("en"), "1.0.0").links;
    expect(fr[0]?.href.endsWith("/docs/site")).toBe(true);
    expect(en[0]?.href.endsWith("/docs/site/en")).toBe(true);
    expect(fr[1]?.href).toBe("https://github.com/ProtoGulix/pantin");
  });
});
