import type { AboutState, CoreVersionState } from "../about-state.ts";
import { VIEWER_VERSION } from "../build-version.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { REPOSITORY_URL, userGuideUrl } from "../links.ts";

// The About window (ADR 0058 point 4) as plain data. No DOM here.

const LICENCE_NAME = "Apache License 2.0";

export type VersionAgreement = "pending" | "unreachable" | "same" | "different";

/** Whether the viewer in the browser and the core come from the same build. */
export function versionAgreement(viewerVersion: string, core: CoreVersionState): VersionAgreement {
  switch (core.status) {
    case "loading":
      return "pending";
    case "unreachable":
      return "unreachable";
    case "known":
      return core.version === viewerVersion ? "same" : "different";
  }
}

interface AboutLinkView {
  label: string;
  href: string;
}

export interface AboutView {
  visible: boolean;
  title: string;
  closeLabel: string;
  viewerLabel: string;
  viewerVersion: string;
  coreLabel: string;
  // The core version, or why it is not shown.
  coreText: string;
  licenceLabel: string;
  licenceName: string;
  // The warning shown when the two versions differ; null otherwise.
  mismatch: string | null;
  links: AboutLinkView[];
  newTabHint: string;
}

function coreText(core: CoreVersionState, t: Translate): string {
  switch (core.status) {
    case "loading":
      return t("about.core.loading");
    case "unreachable":
      return t("about.core.unreachable");
    case "known":
      return core.version;
  }
}

export function buildAboutView(
  about: AboutState,
  language: Language,
  t: Translate,
  viewerVersion: string = VIEWER_VERSION,
): AboutView {
  const different = versionAgreement(viewerVersion, about.core) === "different";
  return {
    visible: about.open,
    title: t("about.title"),
    closeLabel: t("about.close"),
    viewerLabel: t("about.viewer"),
    viewerVersion,
    coreLabel: t("about.core"),
    coreText: coreText(about.core, t),
    licenceLabel: t("about.licence"),
    licenceName: LICENCE_NAME,
    mismatch:
      different && about.core.status === "known"
        ? t("about.mismatch", { viewer: viewerVersion, core: about.core.version })
        : null,
    links: [
      { label: t("about.link.guide"), href: userGuideUrl(language) },
      { label: t("about.link.repository"), href: REPOSITORY_URL },
    ],
    newTabHint: t("welcome.link.newTab"),
  };
}
