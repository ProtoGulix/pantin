import type { Language } from "./i18n/translate.ts";

// Where the viewer sends the user outside the app: the welcome window's
// resources and the Help menu. The guide is the Markdown of docs/site on the
// repository, which is always reachable; the published site (ADR 0051) is not
// yet live.

export const REPOSITORY_URL = "https://github.com/ProtoGulix/pantin";

/** The user guide in the language of the viewer (French at the root, English under en/). */
export function userGuideUrl(language: Language): string {
  const root = `${REPOSITORY_URL}/tree/master/docs/site`;
  return language === "fr" ? root : `${root}/en`;
}
