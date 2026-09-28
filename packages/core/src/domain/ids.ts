const MAX_ID_LENGTH = 64;

function trimDashes(text: string): string {
  return text.replace(/^-+/, "").replace(/-+$/, "");
}

// Turns a display name into a candidate id: ASCII lowercase letters, digits
// and single dashes. Returns `fallback` when nothing usable remains.
export function slugifyDisplayName(displayName: string, fallback: string): string {
  const ascii = displayName.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const dashed = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const slug = trimDashes(trimDashes(dashed).slice(0, MAX_ID_LENGTH));
  return slug === "" ? fallback : slug;
}

// Returns `baseId` if free, else `baseId-2`, `baseId-3`... shortened so the
// result never exceeds the id length limit.
export function makeUniqueId(baseId: string, takenIds: ReadonlySet<string>): string {
  let candidate = baseId;
  for (let suffixNumber = 2; takenIds.has(candidate); suffixNumber += 1) {
    const suffix = `-${suffixNumber}`;
    candidate = `${trimDashes(baseId.slice(0, MAX_ID_LENGTH - suffix.length))}${suffix}`;
  }
  return candidate;
}

// File name without directories nor extension: "parts/Rail 800.glb" -> "Rail 800".
export function fileNameStem(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const dotIndex = baseName.lastIndexOf(".");
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  return stem.trim() === "" ? baseName : stem;
}
