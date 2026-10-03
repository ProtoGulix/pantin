import type { OrphanMeshDeletionResponse, OrphanMeshList } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import {
  formatFileSize,
  orphanCleanupDetails,
  orphanCleanupMessage,
  orphanCleanupPromptText,
} from "./orphan-cleanup-details.ts";

// The orphan cleanup's texts (ADR 0038 point 7).

// Intl puts a narrow no-break space (U+202F) between the number and the unit in French.
const NNBSP = " ";

function listOf(count: number): OrphanMeshList {
  const files = Array.from({ length: count }, (_, index) => ({
    fileName: `f${String(index).padStart(2, "0")}.glb`,
    sizeInBytes: 1000,
  }));
  return { files, totalSizeInBytes: count * 1000 };
}

describe("formatFileSize", () => {
  it("pins the Intl output in French: o, ko, Mo, Go with a comma and U+202F", () => {
    expect(formatFileSize(512, "fr")).toBe(`512${NNBSP}o`);
    expect(formatFileSize(1500, "fr")).toBe(`1,5${NNBSP}ko`);
    expect(formatFileSize(1190116, "fr")).toBe(`1,2${NNBSP}Mo`);
    expect(formatFileSize(2_500_000_000, "fr")).toBe(`2,5${NNBSP}Go`);
  });

  it("pins the Intl output in English: byte, kB, MB with a point", () => {
    expect(formatFileSize(512, "en")).toBe("512 byte");
    expect(formatFileSize(1500, "en")).toBe("1.5 kB");
    expect(formatFileSize(1190116, "en")).toBe("1.2 MB");
  });

  it("uses decimal units: 1000 octets are 1 ko, 999 are not", () => {
    expect(formatFileSize(999, "fr")).toBe(`999${NNBSP}o`);
    expect(formatFileSize(1000, "fr")).toBe(`1${NNBSP}ko`);
    expect(formatFileSize(0, "fr")).toBe(`0${NNBSP}o`);
  });
});

describe("the prompt text and details", () => {
  it("names the count, the total size and the meshes folder, in the plural", () => {
    expect(orphanCleanupPromptText(listOf(3), "fr")).toBe(
      `Supprimer 3 fichiers orphelins du dossier meshes (3${NNBSP}ko) ? Aucun corps ne les utilise.`,
    );
    expect(orphanCleanupPromptText(listOf(1), "fr")).toContain("Supprimer 1 fichier orphelin ");
  });

  it("lists one line per file with its size", () => {
    expect(orphanCleanupDetails(listOf(2), "fr")).toEqual([
      `f00.glb (1${NNBSP}ko)`,
      `f01.glb (1${NNBSP}ko)`,
    ]);
  });

  it("keeps 20 lines and ends with the number of the others", () => {
    const lines = orphanCleanupDetails(listOf(25), "fr");
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toBe("… et 5 autres");
    expect(orphanCleanupDetails(listOf(21), "fr").at(-1)).toBe("… et 1 autre");
    expect(orphanCleanupDetails(listOf(20), "fr")).toHaveLength(20);
  });
});

const empty: OrphanMeshDeletionResponse = { deleted: [], skipped: [], failed: [] };
const deleted = [
  { fileName: "a.glb", sizeInBytes: 1000000 },
  { fileName: "b.stl", sizeInBytes: 190116 },
];

describe("orphanCleanupMessage", () => {
  const t = createTranslator("fr");
  const text = (message: ReturnType<typeof orphanCleanupMessage>) =>
    t(message.key, message.parameters);

  it("tells what was deleted and the size freed, as an info", () => {
    const message = orphanCleanupMessage({ ...empty, deleted }, "fr");
    expect(message.level).toBe("info");
    expect(text(message)).toBe(`2 fichiers orphelins supprimés (1,2${NNBSP}Mo libérés).`);
    expect(message.detail).toBeNull();
  });

  it("adds the skipped count and names them in the detail", () => {
    const message = orphanCleanupMessage({ ...empty, deleted, skipped: ["c.glb", "d.glb"] }, "fr");
    expect(message.level).toBe("info");
    expect(text(message)).toContain("2 ignoré(s) : utilisé(s) entre-temps ou déjà absent(s).");
    expect(message.detail).toBe("c.glb, d.glb");
  });

  it("is an error with file names and codes only when a file failed", () => {
    const failed = [
      { fileName: "a.glb", errorCode: "EACCES" },
      { fileName: "other.stl", errorCode: "EBUSY" },
    ];
    const message = orphanCleanupMessage(
      { deleted: deleted.slice(0, 1), skipped: [], failed },
      "fr",
    );
    expect(message.level).toBe("error");
    expect(text(message)).toBe(
      "2 fichiers n'ont pas pu être supprimés (droits insuffisants ou fichier ouvert ailleurs) ; 1 supprimé(s).",
    );
    expect(message.detail).toBe("a.glb: EACCES, other.stl: EBUSY");
    const single = orphanCleanupMessage({ ...empty, failed: failed.slice(0, 1) }, "fr");
    expect(single.detail).toBe("a.glb: EACCES");
  });
});
