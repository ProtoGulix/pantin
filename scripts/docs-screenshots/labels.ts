import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type Language = "fr" | "en";

/** Looks a viewer text up by its key, so the script follows the viewer's wording in each language. */
export type Label = (key: string, parameters?: Readonly<Record<string, string | number>>) => string;

function isTextCatalog(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

export async function loadLabels(repositoryRoot: string, language: Language): Promise<Label> {
  const path = join(repositoryRoot, "packages/viewer/src/i18n/locales", `${language}.json`);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isTextCatalog(parsed)) {
    throw new Error(`${path} is not a flat object of texts.`);
  }
  return (key, parameters = {}) => {
    const text = parsed[key];
    if (text === undefined) {
      throw new Error(`Unknown viewer text "${key}" in ${path}: the viewer's keys changed.`);
    }
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => String(parameters[name] ?? whole));
  };
}
